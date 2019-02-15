//mixin('haha')
//++++++a;

const haha = module.require('haha')

console.log(haha)

async function sleep(ms){
	ms = ms||1000
	const p = new Promise((resolve, reject)=>{
		setTimeout(function(){
			resolve('haha')
		},ms)
	})

	await p
}

async function handler(input){
	haha.hello()

	//await sleep(1000)
	return Object.keys(input).length ? input : 'hello world'
}
