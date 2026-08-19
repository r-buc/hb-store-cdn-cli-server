import fs from 'fs'
import path from 'path'
import log from './log'
import Database from 'better-sqlite3';

let db;

export default {

      module: 'Server',
      log: log.log,
      error: log.error,
      notify: log.notify,

      getStorePath(){
          return path.join(path.dirname(process.execPath), 'bin/store.db')
      },

      renewDB(){
          let store = this.getStorePath()
          let dir   = path.dirname(store)

          if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir);
          }

          // Remove any stale file so we always start with a fresh DB.
          if (fs.existsSync(store)) {
              fs.unlinkSync(store)
          }

          const db = new Database(store)
          db.prepare(
              'CREATE TABLE homebrews (' +
              this.DB_COLUMNS.map(c => `${c.name} ${c.type}`).join(', ') +
              ')'
          ).run()
          db.close()

          this.log("store.db has been renewed")
      },

      instance(){
          // store.db is now regenerated on every /store.db request (see
          // server.js), so close any previously opened handle first to
          // avoid leaking file descriptors/connections over time.
          if(this.db){
              try {
                  this.db.close()
              }
              catch(e){}
          }

          const db = new Database(this.getStorePath())
          this.db = db

          return db
      },

      // Proper table definition: each entry declares the column name and its
      // SQLite type. Used for CREATE TABLE, INSERT generation, and casts.
      DB_COLUMNS: [
          { name: 'pid',               type: 'INTEGER' },
          { name: 'id',                type: 'TEXT' },
          { name: 'name',              type: 'TEXT' },
          { name: 'desc',              type: 'TEXT' },
          { name: 'image',             type: 'TEXT' },
          { name: 'package',           type: 'TEXT' },
          { name: 'version',           type: 'TEXT' },
          { name: 'picpath',           type: 'TEXT' },
          { name: 'desc_1',            type: 'TEXT' },
          { name: 'desc_2',            type: 'TEXT' },
          { name: 'ReviewStars',       type: 'TEXT' },
          { name: 'Size',              type: 'TEXT' },
          { name: 'Author',            type: 'TEXT' },
          { name: 'apptype',           type: 'TEXT' },
          { name: 'pv',                type: 'TEXT' },
          { name: 'main_icon_path',    type: 'TEXT' },
          { name: 'main_menu_pic',     type: 'TEXT' },
          { name: 'releaseddate',      type: 'TEXT' },
          { name: 'number_downloads',  type: 'INTEGER' },
          { name: 'github',            type: 'TEXT' },
          { name: 'video',             type: 'TEXT' },
          { name: 'twitter',           type: 'TEXT' },
          { name: 'content_id',        type: 'TEXT' },
      ],

      normalizeItem(item){
          let row = {}
          for (const { name, type } of this.DB_COLUMNS) {
              let val = item[name] ?? null
              if (val !== null) {
                  if (type === 'INTEGER') val = parseInt(val, 10)
              }
              row[name] = val
          }
          return row
      },

      addAllItems(items){
          const db = this.instance()

          const cols   = this.DB_COLUMNS.map(c => c.name)
          const params = cols.map(n => '@' + n)
          const insert = db.prepare(
              `INSERT INTO homebrews (${cols.join(',')}) VALUES (${params.join(',')})`
          )

          const insertAll = db.transaction( items => {
              for (const item of items)
                insert.run(this.normalizeItem(item))
          })

          insertAll(items)
      },


}
