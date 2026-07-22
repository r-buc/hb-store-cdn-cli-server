import fs from 'fs'
import os from 'os'
import path from 'path'
import axios from 'axios'
import Database from 'better-sqlite3'
import log from './log'

const REMOTE_STORE_ORIGIN = 'https://api.pkg-zone.com'
const REMOTE_STORE_URL = REMOTE_STORE_ORIGIN + '/store.db'

export default {
    module: 'RemoteStore',
    log: log.log,
    error: log.error,

    fetchItemsForBase(base){
        let tempStore = path.join(os.tmpdir(), `pkg-zone-store-${process.pid}-${Date.now()}.db`)
        let remoteDB = null

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
        .then(items => items.map(item => this.rewriteItemForBase(item, base)))
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

    rewriteItemForBase(item, base){
        return {
            ...item,
            package: this.getProxyURL(base, item.package),
            image: this.getProxyURL(base, item.image),
            main_icon_path: this.getProxyURL(base, item.main_icon_path || item.image),
        }
    },

    getProxyURL(base, target=''){
        if(!target)
          return target

        let remoteURL = this.toRemoteURL(target)
        return `${base}/proxy/${this.encodeURL(remoteURL)}`
    },

    toRemoteURL(target=''){
        if(/^https?:\/\//i.test(target))
          return new URL(target).toString()

        return new URL(target, REMOTE_STORE_ORIGIN).toString()
    },

    encodeURL(url=''){
        return Buffer.from(url)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '')
    },

    decodeURL(value=''){
        let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
        let padding = (4 - (base64.length % 4)) % 4
        return Buffer.from(base64 + '='.repeat(padding), 'base64').toString('utf-8')
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
