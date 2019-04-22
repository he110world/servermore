const fs = require('./fs')
const mime = require('mime-types')
const hook = require('./hook')
const path_util = require('path')
const DIRECTORY_HINT = '__this_is_a_directory__'

class FileManager {
	constructor({list_dir,hook,url}){
		this.list_dir = list_dir
		this._hook = hook
	}

	async _get(path,ctx){
		const stats = await fs.statAsync(path)
		if (stats.isDirectory()) {
			if (this.list_dir) {
				const file_list = await fs.readdirAsync(path)
				file_list.unshift(DIRECTORY_HINT)
				return file_list
			} else {
				ctx.throw(403)
			}
		} else {
			ctx.type = mime.lookup(path)
			return await fs.readFileAsync(path,'utf8')
		}
	}

	async get(path,ctx){
		path = path_util.resolve(path)
		if (fs.existsSync(path)) {
			return await this._get(path,ctx)
		} else if (this._hook) {
			console.log(2)
			try{
				const res = await hook.post(this._hook, {path:ctx.url})
				return await this._get(path,ctx)
			}catch(e){
				console.log(e)
				throw e
			}
		} else {
			ctx.throw(404)
		}
	}

	/*
	async get(path, ctx){
		if(fs.existsSync(path)){
			this._get(path,ctx)
		} else if (this._hook) {
			try{
				console.log(path)
				const res = await superagent.post(this._hook).send({path:path})
				console.log(res.body)
				return await this._get(path,ctx)
			}catch(e){
				console.log(e)
				ctx.throw(400)
			}
		} else {
			ctx.throw(404)
		}
	}
       */
}

module.exports = FileManager
