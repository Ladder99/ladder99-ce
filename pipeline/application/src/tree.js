//. move this into dataProbe.js

import * as libapp from './libapp.js'

// get flat list of elements from given json tree (just devices and dataitems)
export function getElements(json) {
  const elements = []
  recurse(json, elements)
  return elements
}

const ignore = () => {}

const elementHandlers = {
  // handle attributes, eg { id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
  _attributes: (obj, value) =>
    Object.keys(value).forEach(key => (obj[key] = value[key])),
  // handle text/value, eg value = 'Mill w/Smooth-G'
  _text: (obj, value) => (obj.value = value),
}

const appendTags = libapp.getSet('Device,DataItem') //. handle Description - add to Device obj?
const skipTags = libapp.getSet('Agent')

//

// traverse a tree of elements, adding them to an array
//. refactor, add comments
//. handle parents differently - do in separate pass?
function recurse(el, objs, tag = '', parents = []) {
  // el can be an object, an array, or an atomic value

  // handle object with keyvalue pairs
  if (libapp.isObject(el)) {
    // start object, which is a translation of the json element to something usable.
    // tag is eg 'DataItem', parents is list of ancestors - will be deleted before return.
    let obj = { tag, parents }

    // add obj to return list if one of certain tags (eg DataItem)
    if (appendTags.has(tag)) objs.push(obj)

    // get keyvalue pairs, skipping some tags (eg Agent)
    const pairs = Object.entries(el).filter(([key]) => !skipTags.has(key))

    // iterate over keyvalue pairs
    // eg key='_attributes', value={ id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
    for (const [key, value] of pairs) {
      const handler = elementHandlers[key] || ignore // get keyvalue handler
      handler(obj, value) // adds value data to obj
      const newparents = [...parents, obj] // push obj onto parents path list
      recurse(value, objs, key, newparents) // recurse
    }

    // get steps (path parts) for devices and dataitems
    if (tag === 'DataItem') {
      // obj.signature = [...obj.parents.slice(4), obj]
      //   .map(getPathStep)
      //   .filter(step => !!step)
      //   .join('/')
      // save device path
      obj.device = getPathStep(obj.parents[3])
      // save steps for rest of path to array
      obj.steps = [...obj.parents.slice(4), obj].map(getPathStep)
    } else {
      obj.steps = [obj].map(getPathStep)
    }

    // get rid of the parents list
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

// ignore these element types - don't add much info to the path
const ignoreTags = libapp.getSet(
  'Adapters,AssetCounts,Devices,DataItems,Components,Filters,Specifications'
  // ''
)

//. assume for now there there is only one of these in path, so can just lower case them
//. in future, do two passes to determine if need to uniquify them with nums or names?
//. or use aliases table to refer by number or name or id to a propertydef
const plainTags = libapp.getSet(
  'Systems,Feeder,Resources,Personnel,EndEffector,Controller,Path,Axes'
)

// ignore these DataItem attributes - not necessary to identify an element,
// or are redundant.
const ignoreAttributes = libapp.getSet(
  'category,discrete,type,subType,_key,tag,parents,id,unit,units,nativeUnits,device,name,compositionId'
)

function getPathStep(obj) {
  let params = []
  if (!obj) return ''
  if (ignoreTags.has(obj.tag)) return ''
  //. for plain tags, eg Path, will want to do two passes - first to see how many Paths there are,
  // then to assign numbers to the steps, eg path vs path1, path2.
  if (plainTags.has(obj.tag)) return obj.tag[0].toLowerCase() + obj.tag.slice(1)
  let step = ''
  switch (obj.tag) {
    case 'Device':
    case 'Agent':
      // params = [obj.uuid] // standard says name may be optional in future versions, so use uuid
      step = `Device(${obj.uuid})`
      break
    case 'DataItem':
      // add primary params
      params = [obj.type]
      if (obj.subType) params.push(obj.subType)
      // add named params
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
      if (obj.category === 'CONDITION') {
        step = getParamsStep(params) + '-condition'
      } else {
        step = getParamsStep(params)
      }
      break
    // case 'Specification':
    // case 'Composition':
    //   // params = [obj.type]
    //   // if (obj.subType) params.push(obj.subType)
    //   step = '?'
    //   break
    default:
      // params = [obj.name || obj.id || '']
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

function getParamsStep(params) {
  const paramsStr =
    params.length > 0 && params[0].length > 0
      ? // ? params.map(param => param.toLowerCase()).join(',')
        params.map(getParamString).join('-')
      : ''
  // const step = `${obj.tag}${paramsStr}`
  const step = `${paramsStr}`
  return step
}

function getParamString(param) {
  // const str = param.replace('x:', '').replaceAll('_', '-').toLowerCase() // needs node15
  const regexp = new RegExp('_', 'g')
  const str = param.replace('x:', '').replace(regexp, '-').toLowerCase()
  //. change chars AFTER - to uppercase - how do?
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

// transform objs to db node structure
export function getObjects(json) {
  const elements = getElements(json)
  const objs = elements.map(element => {
    const obj = { ...element }
    // obj.type = element.tag === 'DataItem' ? 'PropertyDef' : element.tag
    obj.type = element.tag
    obj.path = element.steps && element.steps.filter(step => !!step).join('/')
    delete obj.category
    delete obj.tag
    delete obj.steps
    delete obj.subType
    return obj
  })
  return objs
}
// console.log(nodes)

// function getCanonicalStep(step) {
//   const canonicalStep = yaml.paths[step]
//   if (canonicalStep === null) return ''
//   return canonicalStep || step
// }

// process.exit(0)

//------------------------------------------------------------------------

export function getNodes(objs) {
  // objs = getUniqueByPath(objs)
  let nodes = []
  for (const obj of objs) {
    const node = { ...obj }
    if (node.type === 'Device') {
      // const device = { ...obj }
      // nodes.push(node)
    } else {
      // const propdef = { ...obj }
      node.type = 'PropertyDef'
      //. leave these in the node bag?
      delete node.id
      delete node.name
      delete node.device
      delete node.discrete
      delete node.unit
      delete node.units
      delete node.nativeUnits
      delete node.coordinateSystem
      delete node.representation
      delete node.compositionId
      // nodes.push(propdef)
    }
    nodes.push(node)
  }
  nodes = getUniqueByPath(nodes)
  return nodes
}

function getUniqueByPath(nodes) {
  const d = {}
  nodes.forEach(node => (d[node.path] = node))
  return Object.values(d)
}

export function getIndexes(nodes, objs) {
  // initialize indexes
  const indexes = {
    nodeById: {},
    nodeByPath: {},
    objById: {},
  }

  for (let node of nodes) {
    indexes.nodeById[node.node_id] = node
    indexes.nodeByPath[node.path] = node
  }

  // assign device_id and property_id to dataitems
  objs.forEach(obj => {
    if (obj.type === 'DataItem') {
      indexes.objById[obj.id] = obj
      obj.device_id = indexes.nodeByPath[obj.device].node_id
      obj.property_id = indexes.nodeByPath[obj.path].node_id
    }
  })
  return indexes
}
