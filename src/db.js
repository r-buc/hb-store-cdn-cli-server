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
              'CREATE TABLE homebrews (' + this.DB_COLUMNS.join(', ') + ')'
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

      // All columns expected by the homebrews table. Any item property not
      // listed here is ignored; any listed column absent from the item defaults
      // to null so INSERT never throws "Missing named parameter".
      DB_COLUMNS: ['pid','id','name','desc','image','package','version','picpath','desc_1','desc_2','ReviewStars','Size','Author','apptype','pv','main_icon_path','main_menu_pic','releaseddate','number_downloads','github','video','twitter','content_id'],

      normalizeItem(item){
          let row = {}
          for (const col of this.DB_COLUMNS)
              row[col] = item[col] ?? null
          row.pid = item.pid
          return row
      },

      addAllItems(items){
          const db = this.instance()

          const insert = db.prepare("INSERT INTO homebrews (pid,id,name,desc,image,package,version,picpath,desc_1,desc_2,ReviewStars,Size,Author,apptype,pv,main_icon_path,main_menu_pic,releaseddate,number_downloads,github,video,twitter,content_id) VALUES (CAST(@pid AS INTEGER),@id,@name,@desc,@image,@package,@version,@picpath,@desc_1,@desc_2,@ReviewStars,@Size,@Author,@apptype,@pv,@main_icon_path,@main_menu_pic,@releaseddate,@number_downloads,@github,@video,@twitter,@content_id)")

          const insertAll = db.transaction( items => {
              for (const item of items)
                insert.run(this.normalizeItem(item))
          })

          insertAll(items)
      },


}
