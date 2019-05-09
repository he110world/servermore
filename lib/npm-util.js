const npm = require('npm-programmatic')
const path = require('path')
const fs = require('fs')
const util = require('util')
const is_builtin_module = require('is-builtin-module')
const readFileAsync = util.promisify(fs.readFile)
const exec = require('./exec-async')

class NpmUtil {
	constructor(){
		this._mirror_inited = false
	}

	init(dir){
		this._dir = dir
		this._node_modules_dir = path.join(this._dir, 'node_modules')
	}

	//换成淘宝的registry
	async _check_registry(reg_url){
		reg_url = reg_url || 'https://registry.npm.taobao.org'

		if (this._mirror_inited) {
			return
		}

		const msg = `Set registry to ${reg_url}`
		console.time(msg)

		const get_cmd = 'npm config get registry'
		const registry = await exec(get_cmd)
		if (registry.trim() !== reg_url) {
			const set_cmd = `npm config set registry ${reg_url}`
			await exec(set_cmd)
		}
		this._mirror_inited = true

		console.timeEnd(msg)
	}

	async install(mod_list){
		const install_list = []
		for(const m of mod_list){
			if (!is_builtin_module(m) && install_list.indexOf(m)===-1) {
				const p = path.join(this._node_modules_dir, m)
				if (!fs.existsSync(p)) {
					install_list.push(m)
				}
			}
		}

		console.log('npm install list',install_list)

		if (install_list.length>0) {
			//await this._check_registry()

			console.log('begin npm install',install_list,this._dir)
			await npm.install(install_list, {cwd:this._dir,output:true,save:true})
			console.log('end npm install')
		}
	}

}

module.exports = new NpmUtil()
