const fs = require('./fs')
const mime = require('mime-types')
const DIRECTORY_HINT = '__this_is_a_directory__'

class FileManager {
	constructor({list_dir,hook,url}){
		this.list_dir = list_dir
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
		console.log('[API]',path)
		if (fs.existsSync(path)) {
			return await this._get(path,ctx)
		} else {
			ctx.throw(404)
		}
	}
}

module.exports = FileManager
