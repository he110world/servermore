const fs = require('./fs')
const mime = require('mime-types')
const DIRECTORY_HINT = '__this_is_a_directory__'

class FileManager {
	constructor({list_dir}){
		this.list_dir = list_dir
	}

	async get(path, ctx){
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
			ctx.type = mime.contentType(path)
			return await fs.readFileAsync(path,'utf8')
		}

	}
}

module.exports = FileManager
