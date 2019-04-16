const fs = require('fs')
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

class FsWrap {

	//dirname长这样：aa/bb/cc/module/
	//root_dir就是dirname的上一级
	constructor(dirname){
		this._root_dir = path.join(dirname,'../')
	}

	//文件路径相对于调用文件
	readFile(p,opts,cb){
		p = p.trim()

		//相对于node进程，在这里认为node进程是在root_dir启动的，所以相对路径跟绝对路径是一样的
		p = path.join(this._root_dir, p)

		//但是如果通过..等方式试图访问root_dir的更上级目录，则报错
		if(p.indexOf(this._root_dir)===-1) {
			console.log('access denied', p)
			if(cb){
				cb('access denied')
			} else {
				throw new Error('access denied')
			}
			return
		}

		//处理一下路径
		const _path = path.resolve(p)
		console.log(_path)

		if(cb){
			fs.readFile(_path,opts,cb)
		} else {
			return new Promise((resolve,reject)=>{
				fs.readFile(_path,opts,(err,data)=>{
					if (err) {
						reject(err)
					} else {
						resolve(data)
					}
				})
			})
		}
	}
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
		this.fs = new FsWrap(dirname)
		this._dict = {}
		Object.assign(this.context, {
			require:p=>{
				try{
					if (p==='fs') {
						return this.fs
					} else {
						return require(p)
					}
				}catch(e){
				}

				const p1 = path.join(dirname,'node_modules',p)
				const p2 = path.resolve(p1)
				return require(p2)
			},
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
