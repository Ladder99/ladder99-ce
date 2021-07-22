import * as libapp from './libapp.js'

// get flat list of elements from given json tree
export function getElements(json) {
  const els = []
  recurse(json, els)
  return els
}

const ignore = () => {}

const elementHandlers = {
  // handle attributes, eg { id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
  _attributes: (obj, value) =>
    Object.keys(value).forEach(key => (obj[key] = value[key])),

  // handle text, eg value = 'Mill w/Smooth-G'
  _text: (obj, value) => (obj.text = value),
}

const skipTags = getSet('Agent')
const appendTags = getSet('Agent,Device,Description,DataItem')

//

// traverse a tree of elements, adding them to an array
//. refactor, add comments
//. handle parents differently - do in separate pass?
function recurse(el, els, tag = '', parents = []) {
  // el can be an object, an array, or an atomic value

  // handle object with keyvalue pairs
  if (libapp.isObject(el)) {
    //
    let obj = { tag, parents }
    if (appendTags.has(tag)) els.push(obj)

    // iterate over keyvalue pairs,
    // eg key='_attributes', value={ id: 'd1', name: 'M12346', uuid: 'M80104K162N' }
    const pairs = Object.entries(el).filter(
      ([key, value]) => !skipTags.has(key)
    )
    for (const [key, value] of pairs) {
      const handler = elementHandlers[key] || ignore // get keyvalue handler
      handler(obj, value) // adds value data to obj
      const newparents = [...parents, obj] // push obj onto parents path list
      recurse(value, els, key, newparents) // recurse
    }

    if (tag === 'DataItem') {
      // get signature, eg 'DataItem(event,availability)'
      obj.signature = [...obj.parents.slice(4), obj]
        .map(getPathStep)
        .filter(step => !!step)
        .join('/')
      // get device, eg 'Device(a234)'
      obj.device = getPathStep(obj.parents[3])
      // obj.path = obj.device + '/' + obj.signature
    }

    delete obj.parents
  } else if (Array.isArray(el)) {
    // handle array of subelements
    for (const subel of el) {
      recurse(subel, els, tag, parents) // recurse
    }
  } else {
    // ignore atomic values
    // console.log('>>what is this?', { el })
  }
}

//

// ignore these element types - don't add much info to the path
const ignoreTags = getSet(
  'Adapters,AssetCounts,Devices,DataItems,Components,Filters,Specifications'
)

// ignore these DataItem attributes - not necessary to identify an element,
// or are redundant.
const ignoreAttributes = getSet(
  'category,type,subType,_key,tag,parents,id,units,nativeUnits'
)

function getSet(str) {
  return new Set(str.split(','))
}

// get path step string for the given object.
// eg if it has tag='DataItem', get params like it's a fn,
// eg return 'DataItem(event,asset_changed,discrete=true)'
function getPathStep(obj) {
  let params = []
  if (!obj) return ''
  if (ignoreTags.has(obj.tag)) return ''
  switch (obj.tag) {
    case 'Device':
    case 'Agent':
      params = [obj.uuid] // standard says name may be optional in future versions, so use uuid
      break
    case 'DataItem':
      params = [obj.category, obj.type]
      if (obj.subType) params.push(obj.subType)
      for (const key of Object.keys(obj)) {
        if (!ignoreAttributes.has(key)) {
          params.push(key + '=' + obj[key])
        }
      }
      break
    case 'Specification':
    case 'Composition':
      params = [obj.type]
      if (obj.subType) params.push(obj.subType)
      break
    default:
      // don't give param if it's like "Systems(systems)" - indicates just one in a document
      if ((obj.name || '').toLowerCase() !== (obj.tag || '').toLowerCase()) {
        // params = [obj.id] //. or obj.name ?? sometimes one is nicer than the other
        params = [obj.name || obj.id || '']
      }
      break
  }
  const paramsStr =
    params.length > 0 && params[0].length > 0
      ? '(' + params.map(param => param.toLowerCase()).join(',') + ')'
      : ''
  const step = `${obj.tag}${paramsStr}`
  return step
}
