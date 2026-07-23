import express from 'express'
import http from 'http'
import fs from 'fs'
import fg from 'fast-glob'
import path from 'path'
import axios from 'axios'
import rateLimit from 'express-rate-limit'
import hb from './hb'
import bin from './bin'
import db from './db'
import cli from './cli'
import log from './log'
import clc from 'cli-color'
import helper from './helper'
import pkgInfo from 'ps4-pkg-info'
// import { getPs4PkgInfo } from "@njzy/ps4-pkg-info"
import { getPs4PkgInfo } from "./pkg-tool/node"
import md5File from 'md5-file'
import normalize from 'normalize-path'
import remoteStore from './remoteStore'

export default {
    ip: null,
    port: null,
    basePath: null,
    files: [],
    host: {
        app: null,
        server: null,
        router: null,
    },

    module: 'Server',
    log: log.log,
    error: log.error,
    notify: log.notify,

    getBaseURI(){
        return 'http://' + this.ip + ':' + this.port
    },

    setConfig(config){
        this.ip       = config.host
        this.port     = config.port
        this.basePath = config.basePath
    },

    sendFiles(){
        if(this.files.length)
          cli.showList(this.files)

        else
          this.error("No files found in basePath! Check your basePath and put sommething in!")

        // Only pop up the interactive Server menu when a TTY is actually
        // available - never in a container/headless run (e.g. `start`
        // without `-it`), which must not block on an inquirer prompt.
        if(helper.isInteractive())
          cli.server()
    },

    setState(state=null){
        global.state.server = state
        this.log(clc.cyan("Set Server State to " + state))
    },

    updatePS4IP(ip){
        this.log("I guess we have a ps4 IP here " + ip)
    },

    addCORSHandler(){
        this.host.app.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
            // res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
            // res.setHeader('Access-Control-Allow-Credentials', true);
            next()
        })
    },

    addRouterMiddleware(){
        this.host.app.use((req, res, next) => {
            this.host.router(req, res, next)
        })
    },

    createPaths(){
        this.log("Server is ready to create paths")
        db.renewDB()
        this.files = []
        this.host.router = new express.Router()
        this.addHearthbeatEndpoint()
        this.addFilesFromBasePath()
    },

    async rescanFolder(config){
        console.log("Trigger re-scan")
        this.setConfig(config)
        this.createPaths()
        this.notify("Re-scaned BasePath")
    },

    addHearthbeatEndpoint(){
        this.log("Create Hearthbeat endpoint")
        const storeDBRateLimiter = rateLimit({
            windowMs: 1000,
            limit: 1,
            standardHeaders: true,
            legacyHeaders: false,
        })

        this.host.router.get('/hb', function(request, response){
            response.status(200).json({
                remoteAddress: request.connection.remoteAddress,
                remotePort: request.connection.remotePort,
                localAddress: request.connection.localAddress,
                localPort: request.connection.localPort,
                message: "Hearthbeat of HB-Store CDN Server is working"
            })
        })

        // storage database
        this.host.router.get('/store.db', storeDBRateLimiter, async (request, response) => {
            // console.log("HB-Store Download store.db Request", request)
            // console.log("PS4 IP", request.ip )
            var r = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/
            let ip = request.ip
            let cleanedIP = ip && ip.match(r) ? ip.match(r)[0] : ''
            if(cleanedIP.length)
              this.updatePS4IP(cleanedIP)

            // rebuild store.db with URLs resolved against whoever is asking,
            // so no static IP/host needs to be pre-configured
            let base = this.getRequestBaseURI(request)
            db.renewDB()
            let localItems = this.resolveItemsForBase(base)
            let remoteItems = await remoteStore.fetchItemsForBase(base)
            let items = [...localItems, ...remoteItems].map((item, index) => ({
                ...item,
                pid: index + 1,
            }))
            db.addAllItems(items)

            let store = db.getStorePath()
            response.status(200).download(store, 'store.db')
        })

        this.host.router.get('/proxy/:target', async (request, response) => {
            let target = remoteStore.getProxyTarget(request.params.target || '')

            if(!remoteStore.isAllowedProxyTarget(target)){
                response.status(400).json({
                    error: 'Unsupported proxy target',
                })
                return
            }

            try {
                let upstream = await axios.get(target, {
                    responseType: 'stream',
                    timeout: 30000,
                    validateStatus: () => true,
                })

                response.status(upstream.status)

                for (const header of ['content-type', 'content-length', 'content-disposition', 'etag', 'last-modified', 'accept-ranges']) {
                    if(upstream.headers[header])
                      response.setHeader(header, upstream.headers[header])
                }

                upstream.data.on('error', (error) => {
                    this.error('Remote proxy stream failed: ' + error.message)
                    response.end()
                })

                upstream.data.pipe(response)
            }
            catch(error){
                this.error('Remote proxy request failed: ' + error.message)
                response.status(502).json({
                    error: 'Failed to proxy remote request',
                })
            }
        })

        // check the storage checksum
        this.host.router.get('/api.php', function(request, response){
            if('db_check_hash' in request.query){
                let hash  = md5File.sync(db.getStorePath())
                response.status(200).json({
                    hash,
                    params: request.query,
                })
            }
        })

        // number of downloads?
        this.host.router.get('/download.php', function(request, response){
            response.status(200).json({
                number_of_downloads: "1337",
            })
        })

        // load server binaries
        for (const asset of bin.data.files)
          this.host.router.get('/update/' + asset, function(request, response){
              let file = helper.getFile('bin/' + asset)
              response.status(200).download(file, asset)
          })
    },

    async addFilesFromBasePath(){

        try {
            let folder = fs.statSync(this.basePath)
            let isFolder = folder.isDirectory()

            if(!isFolder){
              this.error("BasePath does exist but doesn't seem to be a valid folder.")
              if(helper.isInteractive())
                cli.run()
              return
            }

        }
        catch (err) {
           if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
              return this.error("BasePath folder doesn't exist");
           }
        }

        this.log("Search for pkg files in basePath at " + this.basePath)
        let patchedBasePath = normalize(this.basePath)
        let toRemoveBasePath = (patchedBasePath.charAt(0) == "/") ? patchedBasePath.substr(1).replace(/[^a-zA-Z0-9-_./]/g, '') : patchedBasePath.replace(/[^a-zA-Z0-9-_./]/g, '')

        let files = fg.sync([patchedBasePath + '/**/*.pkg'])
        this.log("Found " + files.length + " files in basePath")

        // loop for files and map the files to a file object
        // (URLs are kept relative here; the absolute base is resolved
        // per-request when store.db is served, see getRequestBaseURI())
        let i = 1
        for (const file of files){
            // console.log("Start file ", file)
            try {
                // let data = await pkgInfo.extract(file)
                let data = await getPs4PkgInfo(file, { generateBase64Icon: true })
                                        .catch( e => {
                                            this.error("Error in PKG Extraction: "+ e + '; File: ' + file)
                                            throw e
                                        })
                // console.log(data)
                let item = hb.createItem(data, file, i)
                    item = hb.removeBasePath(item, toRemoveBasePath)
                    item = hb.addImages(item)
                    item = this.addFileEndpoint(item)

                this.files.push(item)
                // console.log(item)
                i = i+1
            }
            catch(e){
                this.error("Error", e)
            }

            // console.log("End file ", file)
            // console.log("====")
        }

        db.addAllItems(this.files)
        // console.log("=====================================")
        // console.log("patched file 0 ", this.files[0] )
        // console.log("=====================================")

        this.sendFiles()
    },

    addFileEndpoint(item){
        this.host.router.get(`/${item.patchedFilename}`, function(request, response){
            response.status(200).download(item.path, item.filename)
        })

        this.host.router.get(`/${item.patchedFilename}/icon0.png`, function(request, response){
            let imgData = item.icon0.replace(/^data:image\/png;base64,/, '');
            let img = Buffer.from(imgData, 'base64')

            response.writeHead(200, {
              'Content-Type': 'image/png',
              'Content-Length': img.length
            })

            response.end(img)
        })

        item.package = '/' + item.patchedFilename

        return item
    },

    // An explicitly configured host (config.ini `host` / CDN_HOST env var)
    // always wins, e.g. behind a reverse proxy or custom public domain.
    // Otherwise derive the address from how the client actually reached us,
    // so this works out of the box in containers/NAT setups with no config.
    getRequestBaseURI(request){
        if(this.ip && this.ip.length)
          return this.getBaseURI()

        return request.protocol + '://' + request.get('host')
    },

    resolveItemsForBase(base){
        return this.files.map( item => ({
            ...item,
            package: base + item.package,
            image: base + item.image,
            main_icon_path: base + item.main_icon_path,
        }))
    },

    createServer(){
        const app = express();
        this.host.app = app
        this.host.router = express.Router()
        this.log("Server created")
    },

    async start(config){
        this.setConfig(config)

        if(global.state.server == 'running'){
            this.log(clc.magenta("Server is already started. Restarting server"))
            this.restart(config)
            return
        }

        if(!this.host.app){
            this.createServer()
        }

        // console.log(this.ip, this.ip.length, this.port, this.port.length)
        if(this.port.length == 0){
            this.error("Server cannot start. Please configure a Port")
            this.error("Set it via the Setup menu, config.ini, or the CDN_PORT environment variable")
            // this.$message({ type: 'warning', message: error });
            process.exitCode = 1
            return
        }

        this.host.server = await this.host.app.listen(this.port, () => {
            let addressLabel = (this.ip && this.ip.length) ? this.ip : 'auto-detected per request (Host header)'
            this.notify('Server is running on ' + addressLabel + ' at port ' + this.port)
            this.setState('running')

            this.addCORSHandler()
            this.addRouterMiddleware()
            this.createPaths()
        })
        .on('error', (e) => {
            // console.log({ ...e })
            this.setState('stopped')

            if(e.code === 'EADDRINUSE'){
              this.error("Port " + this.port + " is already in use. Choose another port and restart the Server")
            }
            else {
              this.error('Error in listening on ' + this.ip + ' at port ' + this.port + ". Error: " + e.code)
            }
        })
    },

    async stop(restart=false, config={}){
        this.log('Closing Server')

        if(this.host.server)
          await this.host.server.close(() => {
              this.log('Server closed')
              this.setState('stopped')

              if(restart)
                this.start(config)
              else
                cli.run()
          })
        else
          this.error("Server can not be closed. Server Object does't exist")
    },

    async restart(config){
        this.log("Server restarting triggered")
        this.stop(true, config)
    },

    // Used by the SIGTERM handler (see app.js) for a clean container/process
    // shutdown: closes the HTTP server and DB connection and returns, without
    // falling back to the interactive menu like stop() does.
    async shutdown(){
        this.log('Shutting down...')

        if(this.host.server){
            await new Promise( resolve => this.host.server.close(resolve) )
            this.log('HTTP server closed')
        }

        if(db.db){
            try {
                db.db.close()
                this.log('Database connection closed')
            }
            catch(e){
                this.error(e)
            }
        }

        this.setState('stopped')
    },

}
