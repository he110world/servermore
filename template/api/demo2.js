const module_demo = module.require('module-demo')
async function handler(){
	return 'this is demo2. ' + module_demo.hello()
}
