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
	await sleep(1000)
	return Object.keys(input).length ? input : 'hello world'
}
