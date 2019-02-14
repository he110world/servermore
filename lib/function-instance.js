const bluebird = require('bluebird')
const vm = require('vm')

function wrap (code) {
	const w = 
`
	${code}

	{
		const ctx = __ctx_queue.shift()
		if (typeof handler==='function') {
			ctx.resolve(handler(ctx.input))
		} else {
			ctx.reject('cannot find handler')
		}
	}
`
	return w
}

class FunctionInstance {
	constructor(code, user_ctx){
		this.code_raw = code
		this.code = wrap(code)
		console.log(this.code)
		this.func = vm.createScript(this.code)
		this.context = vm.createContext()

		Object.assign(this.context, {
			__ctx_queue:[],
			console:console,
			require:require,
			Buffer:Buffer,
			Promise:bluebird,
		})

		if (typeof user_ctx === 'object') {
			Object.assign(this.context, user_ctx)
		}
	}

	//把post过来的数据和参数合起来
	_collect_input(ctx){
		const input = {}
		for(let k in ctx.query){
			input[k] = ctx.query[k]
		}
		for(let k in ctx.request.body){
			input[k] = ctx.request.body[k]
		}
		return input
	}

	execute(ctx){
		const context = this.context
		const func = this.func
		ctx.input = this._collect_input(ctx)
		return new Promise((resolve, reject)=>{
			ctx.resolve = resolve
			ctx.reject = reject
			context.__ctx_queue.push(ctx)
			func.runInContext(context)
		})
	}
}

module.exports = FunctionInstance
