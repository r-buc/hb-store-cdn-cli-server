import header from './header'
import path from 'path'
import fs from 'fs'
import helper from './helper'
import db from './db'
import bin from './bin'
import server from './server'
import cli from './cli'
import clc from 'cli-color'

header.start()

var state = {
  server: 'stopped'
}
global.state = state

let args = process.argv.slice(2)
// console.log("Params", args)

// #todo to be done https://www.npmjs.com/package/clui

if(args.includes('setup')){
  if(helper.isInteractive())
    cli.run()
  else
    helper.error("'setup' needs an interactive terminal (TTY). Run this in a real terminal, or configure config.ini / CDN_HOST, CDN_PORT, CDN_BASE_PATH env vars directly.")
}

if(args.includes('init')){
  helper.init()
}

if(args.includes('start')){  
  // checks server binaires on startup
  (new Promise( async (resolve, reject) => {
      await bin.checkServerBinaries()
      resolve()
  }))
  // start the server here
  .then( () => cli.startServer() )  
}

if(args.includes('check-bin')){
  bin.checkServerBinaries()
}

if(args.includes('download-bin')){
  bin.forceServerBinariesDownload()
}

if(args.length == 0){
  // console.log("[Info] No input specified. Running setup command")
  if(helper.isInteractive())
    cli.run()
  else
    helper.error("No command given and no interactive terminal (TTY) available. Use 'start', 'init', 'check-bin' or 'download-bin', or attach a TTY to use the interactive menu.")
}

// Allow a clean shutdown (e.g. `docker stop`, orchestrator restarts,
// systemd) instead of relying on SIGKILL once the grace period expires.
process.on('SIGTERM', async () => {
  helper.notify("Received SIGTERM, shutting down gracefully...")

  let forceExit = setTimeout(() => {
    helper.error("Graceful shutdown timed out, forcing exit")
    process.exit(1)
  }, 5000)

  try {
    await server.shutdown()
    clearTimeout(forceExit)
    process.exit(0)
  }
  catch(e){
    helper.error(e)
    clearTimeout(forceExit)
    process.exit(1)
  }
})



// import { getPs4PkgInfo } from "./pkg-tool/node"
// console.log(getPs4PkgInfo)
