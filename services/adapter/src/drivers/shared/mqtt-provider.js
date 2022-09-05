// mqtt provider
// subscribes to mqtt topics, receives messages, dispatches them to subscribers.

import libmqtt from 'mqtt' // see https://www.npmjs.com/package/mqtt
// import * as lib from './common/lib.js'

export class AdapterDriver {
  //
  constructor() {
    this.subscribers = {} // key is topic, value is array of { callback, selector }
  }

  start({}) {
    console.log('MQTT-provider initializing mqtt driver')
    const url = `mqtt://${host}:${port}`

    // connect to mqtt broker/server
    console.log(`MQTT-provider connecting to broker on ${url}...`)
    const mqtt = libmqtt.connect(url)

    // handle connection
    mqtt.on('connect', function onConnect() {
      console.log(`MQTT-provider connected to broker on ${url}`)

      // register message handler
      console.log(`MQTT-provider registering message handler`)
      mqtt.on('message', onMessage) //. bind(this) ?

      //. loop over all topics and subscribe to each
      // subscribe to any topics defined
      // const topic = replaceDeviceId(entry.topic)
      console.log(`MQTT-provider subscribing to ${topic}`)
      mqtt.subscribe(topic)

      // console.log(`MQTT-provider listening for mqtt messages...`)
    })

    // handle incoming messages and dispatch them to subscribers
    // topic - eg 'l99/pa1/evt/query'
    // message - array of bytes (assumed to be a json string)
    function onMessage(topic, message) {
      message = message.toString()
      console.log(
        `MQTT-provider got message ${topic}: ${message.slice(0, 140)}`
      )
      const payload = JSON.parse(message)
      // payload.id
      //. dispatch message to correct subscribers
      for (let subscriber of this.subscibers[topic]) {
        if (subscriber.selector(topic, payload)) {
          subscriber.callback(topic, payload)
        }
      }
    }
  }

  // subscribe to a topic with an optional selector fn
  subscribe(topic, callback, selector = () => true) {
    this.subscribers[topic] = this.subscribers[topic] || []
    this.subscribers[topic].push({ callback, selector })
  }
}
