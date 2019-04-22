const vm = require('vm')
const path = require('path')

function wrap (code) {
	const w = 
`
	(() => {
		const __ctx__ = __ctx_queue.shift()

		${code}

		if (typeof handler==='function') {
			try{
				const p = handler(__ctx__.input)
				if (p instanceof Promise) {
					p.then(res=>__ctx__.resolve(res))
					.catch(err=>__ctx__.reject(err))
				} else {
					__ctx__.resolve(p)
				}
			}catch(e){
				__ctx__.reject(e)
			}
		} else {
			__ctx__.reject('cannot find handler')
		}
	})()
`
	return w
}

class ApiInstance {
	constructor(code, mod, filename, timeout=10000){
		console.time(filename)

		this.filename = filename

		//filename是这样的aa/bb/api/cc/dd/ee.js
		//__dirname是/api/cc/dd
		//__filename是/api/cc/dd/ee.js
		this.__filename = filename.substr(filename.indexOf('/api'))
		this.__dirname = path.dirname(this.__filename)

		console.log(this.__filename, this.__dirname)

		this.timeout = timeout
		this.code_raw = code
		this.code = wrap(code)
		this.api = new vm.Script(this.code)
		this.context = vm.createContext()
		const ctx_obj = {
			__ctx_queue:[],
			console:console,
			Buffer:Buffer,
			__dirname:this.__dirname,
			__filename:this.__filename
		}
		Object.assign(this.context, ctx_obj)

		if (mod) {
			this.context.module = mod.context.module
		}

		console.timeEnd(filename)
	}

	//把post过来的数据和参数合起来
	_collect_input(ctx){
		const input = {}
		for(const k in ctx.query){
			input[k] = ctx.query[k]
		}
		for(const k in ctx.request.body){
			input[k] = ctx.request.body[k]
		}
		if(ctx.request.files){
			input.files = ctx.request.files
		}
		return input
	}

	execute(ctx){
		const context = this.context
		const api = this.api
		const timeout = this.timeout
		const filename = this.filename
		const obj = {}
		obj.input = this._collect_input(ctx)

		//console.log(context)
		return new Promise((resolve, reject)=>{
			obj.resolve = resolve
			obj.reject = reject
			context.__ctx_queue.push(obj)
			api.runInContext(context, {timeout:timeout, filename:filename})
		})
	}
}

module.exports = ApiInstance
