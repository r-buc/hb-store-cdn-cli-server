import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import net from 'net'
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
            return ['http:', 'https:'].includes(url.protocol) && !this.isBlockedProxyHost(url.hostname)
        }
        catch(e){
            return false
        }
    },

    isBlockedProxyHost(hostname=''){
        let host = hostname.toLowerCase()

        if(!host.length)
          return true

        if(host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
          return true

        let ipVersion = net.isIP(host)
        if(!ipVersion)
          return !host.includes('.')

        if(ipVersion === 4)
          return this.isPrivateIPv4Address(host)

        return this.isPrivateIPv6Address(host)
    },

    isPrivateIPv4Address(host=''){
        let parts = host.split('.').map(part => parseInt(part, 10))
        let [a, b] = parts

        return a === 10
            || a === 127
            || a === 0
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
    },

    isPrivateIPv6Address(host=''){
        let normalizedHost = host.toLowerCase()
        return normalizedHost === '::1'
            || normalizedHost === '::'
            || normalizedHost.startsWith('fc')
            || normalizedHost.startsWith('fd')
            || normalizedHost.startsWith('fe8')
            || normalizedHost.startsWith('fe9')
            || normalizedHost.startsWith('fea')
            || normalizedHost.startsWith('feb')
    },
}
