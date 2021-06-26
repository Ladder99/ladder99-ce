// database class
// wraps arangodb

// import fs from 'fs' // node lib
// import pg from 'pg' // postgres driver https://github.com/brianc/node-postgres
// const { Pool } = pg // import { Client } from 'pg' gives error, so must do this
import { Database, aql } from 'arangojs' // https://github.com/arangodb/arangojs
import * as libapp from './libapp.js'

// arangodb
const arangoHost = process.env.ARANGO_HOST || 'http://localhost'
const arangoPort = process.env.ARANGO_PORT || '8529'
const arangoUrl = `${arangoHost}:${arangoPort}`
const arangoDatabase = process.env.ARANGO_DATABASE || 'ladder99'

export class Db {
  constructor() {
    this.client = null
  }

  async start() {
    await this.connect()
    this.init()
    await this.migrate()
  }

  async connect() {
    const system = new Database(arangoUrl)
    let client = null
    const pool = new Pool()
    do {
      try {
        const params = {
          host: process.env.PGHOST,
          port: process.env.PGPORT,
          database: process.env.PGDATABASE,
        }
        console.log(`Trying to connect to db...`, params)
        client = await pool.connect() // uses envars PGHOST, PGPORT etc
      } catch (error) {
        console.log(`Error ${error.code} - will sleep before retrying...`)
        console.log(error)
        await libapp.sleep(4000)
      }
    } while (!client)
    this.client = client
  }

  init() {
    const that = this

    //. need init:true in compose yaml to get SIGINT etc? tried - nowork
    process
      .on('SIGTERM', getShutdown('SIGTERM'))
      .on('SIGINT', getShutdown('SIGINT'))
      .on('uncaughtException', getShutdown('uncaughtException'))

    // get shutdown handler
    function getShutdown(signal) {
      return error => {
        console.log()
        console.log(`Signal ${signal} received - shutting down...`)
        if (error) console.error(error.stack || error)
        that.disconnect()
        process.exit(error ? 1 : 0)
      }
    }
  }

  disconnect() {
    if (!this.client) {
      console.log(`Releasing db client...`)
      this.client.release()
    }
  }

  //. handle versions - use meta table
  async migrate() {
    // const path = `migrations/001-init.sql`
    // const sql = String(fs.readFileSync(path))
    // console.log(`Migrating database structures...`)
    // await this.client.query(sql)
    // create our db if not there
    const dbs = await system.listDatabases()
    console.log(dbs)
    if (!dbs.includes(arangoDatabase)) {
      console.log(`Creating database ${arangoDatabase}...`)
      await system.createDatabase(arangoDatabase)
    }
    const db = system.database(arangoDatabase)

    // create collections if not there
    const collections = await db.listCollections()
    if (!collections.find(collection => collection.name === 'nodes')) {
      console.log(`Creating nodes collection...`)
      await db.createCollection('nodes')
    }
    if (!collections.find(collection => collection.name === 'edges')) {
      console.log(`Creating edges collection...`)
      await db.createEdgeCollection('edges')
    }
  }

  async query(sql) {
    return await this.client.query(sql)
  }

  // //. read nodes and edges into graph structure
  // async getGraph(Graph) {
  //   const graph = new Graph()
  //   const sql = `SELECT * FROM nodes;`
  //   const res = await this.client.query(sql)
  //   const nodes = res.rows // [{ _id, props }]
  //   console.log(nodes)
  //   for (const node of nodes) {
  //     graph.addNode(node)
  //   }
  //   //. get edges also
  //   return graph
  // }
}
