const FunctionInstance = require('./function-instance')
const path = require('path')
const fs = require('./fs')
const FILE_NOT_FOUND = 'file not found'

class FunctionManager {
	constructor(opts){
		this._cache = {}
		this._fail = {}
		if (typeof opts.context === 'object') {
			this._user_ctx = opts.context
		}
	}

	_set_fail(pathname,failed){
		this._fail[pathname] = failed
	}

	_get_fail(pathname){
		return !!this._fail[pathname]
	}

	async _set_cache(pathname,func,write_file){
		this._cache[pathname] = func

		//清除掉之前的失败记录
		this._set_fail(pathname, false)

		//持久化：写文件
		if (write_file) {
			await this._save_func(func)
		}
	}

	async _load_func(pathname){
		//文件可能是pathname.js或者pathname/index.js
		const filename1 = pathname + '.js'
		const filename2 = path.join(pathname, 'index.js')
		console.log('load func:',filename1)

		try{
			const stat = await fs.statAsync(filename1)
			const code = await fs.readFileAsync(filename1,'utf8')
			const func = new FunctionInstance(code,this._user_ctx)
			return func
		}catch(e){
			console.log('load func failed:',filename1)
		}

		console.log('load func:',filename2)
		try{
			const stat = await fs.statAsync(filename2)
			const code = await fs.readFileAsync(filename2,'utf8')
			const func = new FunctionInstance(code,this._user_ctx)
			return func
		}catch(e){
			console.log('load func failed:',filename2)
		}

	}

	async _get_cache(pathname){
		//读文件失败了？
		if (this._get_fail(pathname)) {
			return null
		}

		let cache = this._cache[pathname]
		if (cache) {
			return cache
		}

		//读文件
		const func = this._load_func(pathname)
		if (func) {
			await this._set_cache(pathname,func)
		} else {
			this._set_fail(pathname, true)
		}
		return func
	}

	async write(pathname,code){
		const func = new FunctionInstance(code,this._user_ctx)
		await this._set_cache(pathname,func,true)
	}

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
		const func = await this._get_cache(pathname)
		if (func) {
			return await func.execute(ctx)
		} else {
			ctx.throw(404)
		}
	}
}

module.exports = FunctionManager
