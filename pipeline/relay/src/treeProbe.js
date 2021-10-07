// companion functions for dataProbe.js
//. move there

import * as libapp from './libapp.js'

// these are the only elements we want to pick out of the probe xml.
//. handle Description elements - add to Device obj
//. add Composition elements - need for uniquification
const appendTags = libapp.getSet('Device,DataItem')

// don't recurse down these elements - not interested in them or their children
const skipTags = libapp.getSet('Agent')

// ignore these element types for path parts - they don't add much info to the path
const ignoreTags = libapp.getSet(
  'Adapters,AssetCounts,Components,DataItems,Devices,Filters,Specifications'
)

//. assume for now there there is only one of these in path, so can just lower case them
//. in future, do two passes to determine if need to uniquify them with nums or names
//. follow opcua-mtconnect convention of names in brackets eg 'tank[high]'
//. or use aliases table to refer by number or name or id to a dataitem
const plainTags = libapp.getSet(
  'Axes,Controller,EndEffector,Feeder,PartOccurrence,Path,Personnel,ProcessOccurrence,Resources,Systems'
)

// ignore these DataItem attributes - not necessary to identify an element,
// are accounted for explicitly, or are redundant.
// any other attributes would be included, eg '-statistic=average'
//. maybe do other way around - list of attributes to include?
// or this could be an ordered list of attributes to use to uniquify a path?
const ignoreAttributes = libapp.getSet(
  'id,name,type,subType,compositionId,category,discrete,_key,tag,parents,units,nativeUnits,device'
)

// get flat list of elements from given json by recursing through probe structure.
// just gets Device and DataItem elements.
// eg json = { MTConnectDevices: { Header, Devices: { Agent, Device }}}
//   with Device = { _attributes, Description, DataItems, Components: { Axes, Controller, Systems }}
//   and DataItems = { DataItem: [ { _attributes: { id:'avail', type, category }}, ...]}
// returns [{
//   node_type: 'DataItem',
//   path: 'availability',
//   id: 'avail',
//   type: 'AVAILABILITY',
//   category: 'EVENT',
//   device: 'Device(VMC-3Axis, 000)'
// }, ...]
export function getElements(json) {
  const elements = []
  recurse(json, elements)
  return elements
}

// do nothing fn - used as default/fallback
const ignore = () => {}

// we've read the xml and converted it to json, and the way the library stores
// attributes and text is with _attributes and _text properties.
// these fns pull that data out from the `value` and stick them into the `obj`.
//. pull out fns?
const elementHandlers = {
  // handle attributes - append attributes from the object `value` to obj
  // eg obj = { foo: 123 }
  // value = { id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
  // obj becomes { foo: 123, id: 'd1', name: 'M12346', uuid: 'M80104K162N'}
  _attributes: (obj, value) =>
    Object.keys(value).forEach(key => (obj[key] = value[key])),
  // handle text/value, eg value = 'Mill w/Smooth-G'
  _text: (obj, value) => (obj.value = value),
}

//

// traverse a tree of elements, adding them to an array
// el can be an object, an array, or an atomic value, eg
//   { MTConnectDevices: { Header, Devices: { Agent, Device }}}
// objs is a growing flat list of objects we're interested in from the els,
//   eg [{ tag: 'DataItem', path, category, id, name }, ...]
// tag is the key for the current element, eg 'DataItem' - blank for root element.
// parents is a list of parent elements that grows as we recurse through the tree.
//. refactor
//. handle parents differently - do in separate pass?
function recurse(el, objs, tag = '', parents = []) {
  // handle object with keyvalue pairs
  if (libapp.isObject(el)) {
    // make object, which translates the json element to something usable.
    // tag is eg 'DataItem'
    // parents is list of ancestors - will be deleted before return.
    // start object, eg { tag: 'DataItem', parents: [ {}, {}, {}, ... ] }
    let obj = { tag, parents }

    // add obj to list if one of certain tags (eg Device, DataItem)
    if (appendTags.has(tag)) objs.push(obj)

    // get keyvalue pairs to recurse, skipping some tags (eg Agent)
    const pairs = Object.entries(el).filter(([key]) => !skipTags.has(key))

    // iterate over keyvalue pairs, handling each as needed
    // eg if el is a Device element
    // with key='_attributes', value={ id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
    // this would add those attributes to the object obj,
    // giving { tag, parents, id, name, uuid }.
    // then recurse with the value as the element el.
    for (const [key, value] of pairs) {
      const handler = elementHandlers[key] || ignore // get keyvalue handler
      handler(obj, value) // adds value data to obj
      const newparents = [...parents, obj] // push obj onto parents path list
      recurse(value, objs, key, newparents) // recurse
    }

    // get steps (path parts) for devices and dataitems
    if (tag === 'DataItem') {
      // save device element, eg { tag, id, name, uuid }
      obj.device = getPathStep(obj.parents[3])

      // save steps for rest of path to an array
      // will convert this to a full path string later
      // eg ['axes', 'x', 'position-actual']
      obj.steps = [...obj.parents.slice(4), obj].map(getPathStep)
    } else if (tag === 'Device') {
      // for Device get single step as an array, eg ['cnc1']
      obj.steps = [obj].map(getPathStep)
    }

    // get rid of the parents array
    delete obj.parents
    //
  } else if (Array.isArray(el)) {
    // handle array of subelements
    for (const subel of el) {
      recurse(subel, objs, tag, parents) // recurse
    }
  } else {
    // ignore atomic values
    // console.log('>>what is this?', { el })
  }
}

//----------------------------------------------------------

// get path step for the given object
// eg, for a Device element, return 'Device(Mazak31, M41283-12A)'
// for a DataItem element, return 'position-actual'
function getPathStep(obj) {
  let params = []
  if (!obj) return ''
  if (ignoreTags.has(obj.tag)) return ''
  //. for plain tags, eg Path, will want to do two passes - first to see how many Paths there are,
  // then to assign numbers to the steps, eg path vs path1, path2.
  if (plainTags.has(obj.tag)) return obj.tag[0].toLowerCase() + obj.tag.slice(1)
  let step = ''
  switch (obj.tag) {
    // case 'Agent':
    case 'Device':
      // standard says name may be optional in future versions, so could just use uuid, eg
      // step = `Device(${obj.uuid})`
      // BUT for the mazak machines, uuid is not actually unique across the installation -
      // they seem to be using it for model number.
      // so name helps uniquify this.
      step = `Device(${obj.name}, ${obj.uuid})`
      break
    case 'DataItem':
      // add primary params
      params = [obj.type] // eg ['position']
      if (obj.subType) params.push(obj.subType) // eg ['position', 'actual']
      // add named params to help uniquify the path, eg ['temperature', 'statistic=average']
      let namedParams = []
      for (const key of Object.keys(obj)) {
        if (!ignoreAttributes.has(key)) {
          namedParams.push(key + '=' + obj[key])
        }
      }
      namedParams.sort()
      for (const namedParam of namedParams) {
        params.push(namedParam)
      }
      // if (obj.category === 'CONDITION') {
      //   step = getParamsStep(params) + '-condition'
      // } else {
      //   step = getParamsStep(params)
      // }
      step = getParamsStep(params)
      break
    // case 'Specification':
    // case 'Composition':
    //   // params = [obj.type]
    //   // if (obj.subType) params.push(obj.subType)
    //   step = '?'
    //   break
    default:
      // params = [obj.name || obj.id || '']
      //..
      step = (obj.name || obj.id || '').toLowerCase()
      break
  }
  // const paramsStr =
  //   params.length > 0 && params[0].length > 0
  //     ? '(' + params.map(param => param.toLowerCase()).join(',') + ')'
  //     : ''
  // const step = `${obj.tag}${paramsStr}`
  return step
}

// get step string for the given array of params.
// eg ['temperature', 'statistic=average'] => 'temperature-statistic=average'
function getParamsStep(params) {
  const paramsStr =
    // params.length > 0 && params[0].length > 0
    params.length > 0 && params[0] && params[0].length > 0
      ? params.map(getParamString).join('-')
      : ''
  const step = `${paramsStr}`
  return step
}

// get string representation of a param
// eg 'x:SOME_TYPE' -> 'x:some_type'
function getParamString(param) {
  // const str = param.replace('x:', '').replaceAll('_', '-').toLowerCase() // needs node15
  // const regexp = new RegExp('_', 'g')
  // const str = param.replace('x:', '').replace(regexp, '-').toLowerCase()
  const str = param.toLowerCase() // leave x: and underscores as is
  //. change chars AFTER '-' to uppercase - how do?
  // const str2 = str
  //   .split()
  //   .map(c => {
  //     if (c === '-') return ''
  //     return c
  //   })
  //   .join('')
  return str
}

//------------------------------------------------------------------------

// transform json tree to flat list of object structures,
// filtering out unwanted elements.
// eg for json = { MTConnectDevices: { Devices: { Device: [...] }}}
// returns [
//   { node_type: 'Device', path, id, name, uuid },
//   { node_type: 'DataItem', path, id, name, category, type, subType },
// ...]
// export function getObjects(json) {
export function getObjects(elements) {
  //. elements =
  // const elements = getElements(json)
  const objs = elements.map(element => {
    const node_type = element.tag // eg 'Device', 'DataItem'
    const path = element.steps && element.steps.filter(step => !!step).join('/')
    const obj = { node_type, path, ...element } // copy object, put node_type and path first
    // remove unneeded attributes
    delete obj.tag
    delete obj.steps
    return obj
  })
  return objs
}

// get nodes from objects
// eg for objects = [{ node_type, id, name, device, path, category, type }, ...]
// returns [{
//   node_type: 'DataItem',
//   path: 'availability',
//   category: 'EVENT',
//   type: 'AVAILABILITY'
// }, ...]
// note that id, name, device were removed
export function getNodes(objs) {
  let nodes = []
  for (const obj of objs) {
    const node = { ...obj } // copy object
    if (node.node_type === 'Device') {
      node.name_uuid = `${node.name} (${node.uuid})`
    } else if (node.node_type === 'DataItem') {
      // remove any unneeded attributes
      delete node.id
      delete node.name
      delete node.device
      // leave these in propdef
      // delete node.compositionId //. will need this only to obtain compositionType - delete later?
      // delete node.discrete
      // delete node.units
      // delete node.nativeUnits
      // delete node.coordinateSystem
      // delete node.representation
    }
    nodes.push(node)
  }
  nodes = getUniqueByPath(nodes)
  return nodes
}

// uniquify nodes by their path
//. eg
// nodes =
// returns
function getUniqueByPath(nodes) {
  const d = {}
  nodes.forEach(node => (d[node.path] = node))
  return Object.values(d)
}

// get indexes for given nodes, objects
//. why need both nodes and objects?
//. eg
// nodes =
// objs =
// returns { nodeById, nodeByPath, objById }
export function getIndexes(nodes, objs) {
  // initialize indexes
  const indexes = {
    nodeById: {},
    nodeByPath: {},
    objById: {},
  }

  // add nodes
  for (let node of nodes) {
    indexes.nodeById[node.node_id] = node
    indexes.nodeByPath[node.path] = node
  }

  // assign device_id and dataitem_id to dataitems
  objs.forEach(obj => {
    if (obj.node_type === 'DataItem') {
      indexes.objById[obj.id] = obj
      obj.device_id = indexes.nodeByPath[obj.device].node_id
      obj.dataitem_id = indexes.nodeByPath[obj.path].node_id
    }
  })
  return indexes
}
