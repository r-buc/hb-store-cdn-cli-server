import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'
import Database from 'better-sqlite3'
import log from './log'

const REMOTE_STORE_ORIGIN = 'https://api.pkg-zone.com'
const REMOTE_STORE_URL = REMOTE_STORE_ORIGIN + '/store.db'

export default {
    module: 'RemoteStore',
    log: log.log,
    error: log.error,
    proxyTargets: {},

    fetchItemsForBase(base){
        let tempStore = path.join(os.tmpdir(), `pkg-zone-store-${process.pid}-${Date.now()}.db`)
        let remoteDB = null
        let proxyTargets = {}

        return axios.get(REMOTE_STORE_URL, {
            responseType: 'arraybuffer',
            timeout: 15000,
        })
        .then(response => {
            fs.writeFileSync(tempStore, Buffer.from(response.data))
            remoteDB = new Database(tempStore, {
                readonly: true,
                fileMustExist: true,
            })

            return remoteDB.prepare('SELECT * FROM homebrews').all()
        })
        .then(items => items.map(item => this.rewriteItemForBase(item, base, proxyTargets)))
        .then(items => {
            this.proxyTargets = proxyTargets
            return items
        })
        .catch(error => {
            this.error('Failed to load remote pkg-zone store: ' + error.message)
            return []
        })
        .finally(() => {
            if(remoteDB){
                try {
                    remoteDB.close()
                }
                catch(e){}
            }

            if(fs.existsSync(tempStore))
                fs.unlinkSync(tempStore)
        })
    },

    rewriteItemForBase(item, base, proxyTargets=this.proxyTargets){
        return {
            ...item,
            package: this.getProxyURL(base, item.package, proxyTargets),
            image: this.getProxyURL(base, item.image, proxyTargets),
            main_icon_path: this.getProxyURL(base, item.main_icon_path || item.image, proxyTargets),
        }
    },

    getProxyURL(base, target='', proxyTargets=this.proxyTargets){
        if(!target)
          return target

        let remoteURL = this.toRemoteURL(target)
        let proxyKey = this.registerProxyTarget(remoteURL, proxyTargets)
        return `${base}/proxy/${proxyKey}`
    },

    toRemoteURL(target=''){
        if(/^https?:\/\//i.test(target))
          return new URL(target).toString()

        return new URL(target, REMOTE_STORE_ORIGIN).toString()
    },

    registerProxyTarget(target='', proxyTargets=this.proxyTargets){
        let proxyKey = crypto.createHash('sha256').update(target).digest('hex')
        proxyTargets[proxyKey] = target
        return proxyKey
    },

    getProxyTarget(proxyKey=''){
        return this.proxyTargets[proxyKey] || null
    },

    isAllowedProxyTarget(target=''){
        try {
            let url = new URL(target)
            let allowedHost = url.hostname === 'pkg-zone.com' || url.hostname.endsWith('.pkg-zone.com')
            return allowedHost && ['http:', 'https:'].includes(url.protocol)
        }
        catch(e){
            return false
        }
    },
}
