const ApiInstance = require('./api-instance')
const ModuleManager = require('./module-manager.js')
const path = require('path')
const fs = require('./fs')
const FILE_NOT_FOUND = 'file not found'

class ApiManager {
	constructor(opts){
		this._cache = {}
		this._fail = {}
		this._caching = !!opts.caching
		/*
		if (typeof opts.context === 'object') {
			this._user_ctx = opts.context
		}
	       */
		this._module_manager = new ModuleManager(opts)
	}

	_set_fail(pathname,failed){
		this._fail[pathname] = failed
	}

	_get_fail(pathname){
		return !!this._fail[pathname]
	}

	async _set_cache(pathname,api,write_file){
		this._cache[pathname] = api

		//清除掉之前的失败记录
		this._set_fail(pathname, false)

		//持久化：写文件
		if (write_file) {
			await this._save_api(api)
		}
	}

	async _load_api_code(filename){
		try{
			return await fs.readFileAsync(filename,'utf8')
		}catch(e){
			return null
		}
	}

	async _load_api_file(filename){
		try{
			const code = await fs.readFileAsync(filename,'utf8')
			const mod = await this._module_manager.get(filename)
			
			const api = new ApiInstance(code,mod,filename)
			return api
		}catch(e){
			return null
		}
	}

	async _load_api(pathname){
		//文件可能是pathname.js或者pathname/index.js
		const filename1 = pathname + '.js'
		const filename2 = path.join(pathname, 'index.js')

		let fname = filename1
		let api_code = await this._load_api_code(fname)
		if(!api_code){
			fname = filename2
			api_code = await this._load_api_code(fname)
		}
		let api
		if(api_code){
			try{
				const mod = await this._module_manager.get(fname)
				api = new ApiInstance(api_code,mod,fname)
			}catch(e){
				console.log(e)
			}
		}
		console.log(fname,api?'loaded':'failed to load')
		return api
	}

	async _get_cache(pathname){
		if (this._caching) {
			//读文件失败了？
			if (this._get_fail(pathname)) {
				return null
			}

			let cache = this._cache[pathname]
			if (cache) {
				return cache
			}
		}

		//读文件
		const api = this._load_api(pathname)

		if (this._caching) {
			if (api) {
				await this._set_cache(pathname,api)
			} else {
				this._set_fail(pathname, true)
			}
		}
		return api
	}

	/*
	async write(pathname,code){
		const api = new ApiInstance(code,this._user_ctx,pathname)
		await this._set_cache(pathname,api,true)
	}
       */

	async list(pathname){
		return await readdir(pathname)
	}

	async read(pathname){
		const cache = await this._get_cache(pathname)
		if (cache) {
			return cache.code_raw
		} else {
			return FILE_NOT_FOUND
		}
	}

	async execute(pathname, ctx){
		const api = await this._get_cache(pathname)
		if (api) {
			return await api.execute(ctx)
		} else {
			ctx.throw(404)
		}
	}
}

module.exports = ApiManager
