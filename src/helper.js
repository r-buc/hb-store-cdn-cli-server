import os from 'os'
import fs from 'fs'
import path from 'path'
import ini from 'ini'
import clc from 'cli-color'
import Table from 'cli-table'
import log from './log'


export default {

    data: {
        default: {
            host: '',
            port: '',
            basePath: '',
            binVersion: '0.00'
        }
    },

    module: 'Main',
    log: log.log,
    error: log.error,
    notify: log.notify,

    getInterfaces(){
        let ifaces = [];
        Object.keys(os.networkInterfaces()).forEach(function (ifname) {
          var alias = 0;
          os.networkInterfaces()[ifname].forEach(function (iface) {
            if ('IPv4' !== iface.family || iface.internal !== false) {
              return;
            }

            if (alias >= 1) {
              ifaces.push({
                title: `${ifname}-${alias}:${iface.address}`,
                ip: iface.address
              });
            } else {
              ifaces.push({
                title: `${ifname}: ${iface.address}`,
                ip: iface.address
              });
            }
            ++alias;
          });
        });
        return ifaces
    },

    getInterfaceChoices(addCustom=false){
        let interfaces = []
        this.getInterfaces().map( iface => {
            interfaces.push({ value: iface.ip, name: iface.title })
        })

        if(addCustom)
          interfaces.push({ value: 'custom', name: 'Use a custom Host IP or Domain' })

        return interfaces
    },

    getFile(asset=''){
        let pwd = path.dirname(process.execPath)
        return path.join(path.dirname(process.execPath), asset)
    },

    getPath(path=''){
        return this.getFile(path)
    },

    // Inquirer prompts need a real TTY on both ends to render (arrow-key
    // menus use raw mode). Without one - e.g. `docker run` without `-it`,
    // piped input, or a cron/orchestrator invocation - prompting would
    // hang or fail, so callers should skip interactive menus in that case.
    isInteractive(){
        return Boolean(process.stdin.isTTY && process.stdout.isTTY)
    },

    loadConfig(){
        let file = this.getFile('config.ini')
        let config = {}

        try {
            config = ini.parse(fs.readFileSync(file, 'utf-8'))
        }
        catch(e){
            this.error("Couldn't load config.ini. Please run the Setup or make a config file.")
        }

        return { ...this.data.default, ...config, ...this.getEnvConfig() }
    },

    // Allows running the server unattended (e.g. in a container) by
    // overriding config.ini values with environment variables, so `start`
    // doesn't depend on the interactive setup menu having run before.
    getEnvConfig(){
        let env = {}

        if(process.env.CDN_HOST)
          env.host = process.env.CDN_HOST

        if(process.env.CDN_PORT)
          env.port = process.env.CDN_PORT

        if(process.env.CDN_BASE_PATH)
          env.basePath = process.env.CDN_BASE_PATH

        return env
    },

    saveConfig(config){
        try {
            let file = this.getFile('config.ini')
            fs.writeFileSync(file, ini.stringify({ ...this.default, ...config }) )
            this.notify("Saved config to " + file, 'Config')
        }
        catch(e){
            this.log(e)
        }
    },

    init(){
        let configFile = this.getFile('config.ini')

        if(!fs.existsSync(configFile)){
            this.saveConfig(this.data.default)
            this.notify("empty config.ini has been created", 'Main')
        }
        else {
            this.error("config.ini already exists", 'Main')
        }
    },

    getServerState(){
        if(global.state.server == 'running')
          return clc.green(global.state.server)

        if(global.state.server == 'stopped')
          return clc.red(global.state.server)

        return clc.cyan(global.state.server)
    },

    getCDN(config){
        let host = (config.host && config.host.length) ? config.host : '(auto-detected per request)'
        return clc.bgWhite.black('CDN Address: http://' + host + ':' + config.port + ' ')
    },

    getTable(head=[], chars={}){
        let defaultChars = {'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': ''}

        let table = new Table({
            head,
            chars: { ...defaultChars, ...chars },
        })

        return table
    },

}
