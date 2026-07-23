import helper from './helper'
import server from './server'
import bin from './bin'
import log from './log'
import { select, input, Separator } from '@inquirer/prompts'
import fs from 'fs'
import path from 'path'
import clc from 'cli-color'
import clear from 'clear'

async function selectDirectory(startPath = process.cwd()) {
    let currentPath = path.resolve(startPath)
    while (true) {
        let entries
        try {
            entries = fs.readdirSync(currentPath, { withFileTypes: true })
        } catch {
            entries = []
        }
        const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))

        const choices = [
            { name: `[✓ Select] ${currentPath}`, value: '__select__' },
            { name: '.. (go up)', value: '__up__' },
            ...dirs.map(d => ({ name: d.name + '/', value: path.join(currentPath, d.name) })),
        ]

        const choice = await select({ message: 'Select basePath:', choices, loop: false, pageSize: 15 })

        if (choice === '__select__') return currentPath
        if (choice === '__up__') currentPath = path.dirname(currentPath)
        else currentPath = choice
    }
}

export default {

    module: 'Main',
    log: log.log,
    error: log.error,
    notify: log.notify,

    async run(){
        const run = await select({
            message: "## Menu ## HB-Store CDN CLI Server",
            loop: false,
            pageSize: 12,
            choices: [
                {
                    value: "start",
                    name: "[Server] Start the server as pre-configured"
                },
                new Separator(),
                {
                    value: "initConfig",
                    name: "[Config] Initialize empty config file",
                },
                {
                    value: "loadConfig",
                    name: "[Config] Show me the current Configuration",
                },
                {
                    value: "setup",
                    name: "[Config] Generate new Config file for Server",
                },
                new Separator(),
                {
                    value: "check-server-binaries",
                    name: "[Bin] Check Server Binaries",
                },
                {
                    value: "download-bin",
                    name: "[Bin] Force re-download server binaries",
                },
                new Separator(),
                {
                    value: "quit",
                    name: "Quit Application."
                },
                new Separator(),
            ]
        })
        console.log(" ")

        if(run == 'setup'){
            let preConfig = helper.loadConfig()
            let newConfig = await this.configure()

            let finalConfig = { ...preConfig, ...newConfig }

            helper.saveConfig(finalConfig)
            await this.showCurrentConfig()
            this.run()
        }

        if(run == 'loadConfig'){
            await this.showCurrentConfig()
            this.run()
        }

        if(run == 'initConfig'){
            await helper.init()
            this.run()
        }

        if(run == 'start'){
            let config = helper.loadConfig()
            server.start(config)
        }

        if(run == 'check-server-binaries'){
            await bin.checkServerBinaries()
            this.run()
        }

        if(run == 'download-bin'){
            await bin.forceServerBinariesDownload()
            this.run()
        }
    },

    async configure(){
        let interfaceChoices = helper.getInterfaceChoices(true)
        let defaultHost = interfaceChoices[0].value

        const host = await select({
            message: "Which Network Interface are you using? Your local IP?",
            default: defaultHost,
            choices: interfaceChoices,
        })

        let resolvedHost = host
        if(host == 'custom'){
            resolvedHost = await input({ message: "You want to use a custom Host. What is it?" })
        }

        const port = await input({ message: "Which port do you want to choose?", default: '6449' })

        const path_choose = await select({
            message: "Which basePath do you wanna set?",
            default: 'default',
            choices: [
                {
                    value: 'default',
                    name: "Default to current sub folder /pkg"
                },
                {
                    value: 'tree',
                    name: 'Choose with Tree view'
                },
                {
                    value: 'manual',
                    name: 'Put your path yourself in'
                }
            ]
        })

        let basePath
        if(path_choose == 'manual'){
            basePath = await input({ message: "Put in the base path manually" })
        } else if(path_choose == 'tree'){
            basePath = await selectDirectory(path.dirname(process.execPath))
        } else {
            let pkgPath = path.join(path.dirname(process.execPath), '/pkg')
            if (!fs.existsSync(pkgPath)) {
                fs.mkdirSync(pkgPath)
            }
            basePath = pkgPath
        }

        return {
            host: resolvedHost,
            port,
            basePath,
        }
    },

    async server(){
        let config = helper.loadConfig()
        const run = await select({
            message: "## Server ## HB-Store CDN CLI Server",
            choices: [
                {
                    value: "state",
                    name: "CDN Server is: " + helper.getServerState(),
                },
                {
                    value: "cdn",
                    name: helper.getCDN(config),
                },
                new Separator(),
                {
                    value: "start",
                    name: "[Server] Start the server"
                },
                {
                    value: "restart",
                    name: "[Server] Restart the server"
                },
                {
                    value: "stop",
                    name: "[Server] Stop the server"
                },
            ]
        })

        if(run == 'stop')
            server.stop()

        if(run == 'start')
            server.start(config)

        if(run == 'restart')
            server.restart(config)

        if(run == 'state' || run == 'cdn')
            this.server()
    },

    async startServer(){
        let config = helper.loadConfig()
        server.start(config)
    },

    async showCurrentConfig(){
        let config = helper.loadConfig()
        this.log("Loaded Config", 'Main')

        let table = helper.getTable(['Key', 'Value'])

        for (const [key, value] of Object.entries(config)) {
            table.push([key + " ", value + " "])
        }

        console.log(table.toString())
    },

    async showList(files=[]){
        let table = helper.getTable([ 'id', 'name', 'version', 'size' ])

        files.map( file => {
            let id = file.id ? file.id + " " : '-'
            let name = file.name ? file.name + " " : '-'
            let version = file.version ? file.version + " " : '-'
            let size = file.Size ? file.Size + " " : '-'
            table.push([id, name, version, size ])
        })

        try {
            console.log(table.toString())
        }
        catch(e){
            console.log(clc.red("Could not show the files list. Error accoured."))
            console.log(e)
        }
    },


}

