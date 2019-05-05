const fs = require('./fs')
const path = require('path')
const Module = require('./module')

class ModuleManager {
	constructor(opts){
		this._dir = opts.dir
		this._cache = {}
	}

	_get_module_dir(pathname){
		return pathname.substr(0,pathname.indexOf('/api/')+5).replace('/api/','/module/')
	}

	async get(pathname){
		const dir = this._get_module_dir(pathname)

		//已经加载了
		let mod = this._cache[dir]
		if (mod) {
			return mod
		}

		//还没有加载
		//扫描文件夹
		let file_list = []
		try{
			file_list = await fs.readdirAsync(dir)
		}catch(e){
			console.log(e)
		}

		if (file_list.length>0) {
			const mod_list = file_list.filter(a=>a.endsWith('.js')).map(a=>path.join(dir,a))


			//加载模块
			const params = {
				dir:this._dir,
				dirname:dir
			}
			mod = new Module(params)
			for(const filename of mod_list){
				const modname = path.basename(filename, '.js')
				const code = await fs.readFileAsync(filename,'utf8')

				try{
					await mod.add(modname, code)
				}catch(e){
					console.log(e)
				}
			}

			mod.finish()

			this._cache[dir] = mod
		}

		return mod
	}
}

module.exports = ModuleManager
