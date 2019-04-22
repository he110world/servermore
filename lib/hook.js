const superagent = require('superagent')

module.exports = {
	post:async function(hook_url, payload){
		console.log(hook_url,payload)
		return await superagent.post(hook_url).send(payload)
	}
}
