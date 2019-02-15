const fs = require('./fs')
const path = require('path')
const vm = require('vm')

function wrap(code) {
	const w =
`
	(() => {
		const __obj__ = __queue__.shift()
		const module = {exports:{}}

		try{
			${code}

			__obj__.resolve(module)
		}catch(e){
			__obj__.reject(e)
		}
	})()
`
	return w
}

class ModuleContainer {
	constructor(dict){
		this.dict = dict
	}
	require(name){
		return this.dict[name]
	}
}

class Module {
	constructor(dirname){
		this.dirname = dirname
		this.context = {}
		this._dict = {}
		Object.assign(this.context, {
			//module:new ModuleContainer(this.context),
			require:require,
			console:console,
			Buffer:Buffer,
			Promise:Promise,
			setTimeout:setTimeout,
			setInterval:setInterval
		})
		vm.createContext(this.context)
	}

	_add(modname, code){
		const context = this.context
		return new Promise((resolve, reject)=>{
			const obj = {}
			obj.resolve = resolve
			obj.reject = reject
			obj.name = modname
			context.__queue__ = context.__queue__ || []
			context.__queue__.push(obj)
			vm.runInContext(wrap(code), context)
		})
	}

	async add(modname, code){
		const m = await this._add(modname, code)
		this._dict[modname] = m.exports
	}

	//去掉除了module之外的所有成员
	finish(){
		this.context.module = new ModuleContainer(this._dict)
	}
}

module.exports = Module
