(function() {
	'use strict';


	const net = require('net');
	const log = require('ee-log');
	const dns = require('dnsd');





	module.exports = class Application {


		constructor() {
			this.port = 53;
			this.domain = null;


			// get options from args
			Array.from(process.argv).filter((v) => {
				return /\-\-[a-z_-]+\=/i.test(v)
			}).map((v) => {
				const parts = /\-\-([a-z_-]+)\=(.+)$/i.exec(v);

				return {
					  option 	: parts[1]
					, value  	: parts[2]
				}
			}).forEach((option) => {
				switch (option.option) {
					case 'port':
						this.port = parseInt(option.value, 10);
						break;

					case 'domain':
						this.domain = option.value;
						break;

					default:
						console.log(`Invalid option '${option.option}'!`.yellow);
				}
			});

			
			console.log(`Server is listening on port ${(this.port+'').blue} using ${(this.domain === null ? 'any x.y domain' : `the domain ${this.domain.green}`)}`);


			// the regexp to use to parse the queries
			if (this.domain === null) this.regexp = /^(.+)\..+\..+$/gi;
			else this.regexp = new RegExp(`^(.+)\\.${this.domain.replace('.', '\\.')}$`, 'gi');


			this.server = dns.createServer(this.handleRequest.bind(this));
			this.server.listen(this.port);

			this.server.on('error', log);
		}







		handleRequest(request, response) {
			try {
				request.question.forEach((question) => {
					const respond = (answer, ttl) => {
						response.answer.push({
							  name	: question.name
							, type 	: question.type
							, class : question.class
							, ttl 	: ttl || 60
							, data 	: answer
						});
					};


					if (question.class === 'IN') {

						switch (question.type) {
							case 'A':
								this.handleARequest(question, respond);
								break;

							case 'NS':
								this.handleNSRequest(question, respond);
								break;

							case 'SOA':
								this.handleSOARequest(question, respond);
								break;
						}
					}
				});
			} catch (e) {
				log(e);
			}

			response.end();
		}





		handleNSRequest(question, respond) {
			respond('dns.dnsporn.joinbox.com');
			respond('dns.dnsporn.joinbox.ch');
		}





		handleSOARequest(question, respond) {
			respond({
				  mname: 'dns.dnsporn.joinbox.com.'
				, rname:'hosting.joinbox.com.'
				, serial: 1483995988
				, refresh: 86400
				, retry: 7200
				, expire: 604800
				, ttl: 604800
			});
		}





		handleARequest(question, respond) {


			// parse dns parts
			this.regexp.lastIndex = 0;
			const parts = this.regexp.exec(question.name);


			if (parts && parts.length === 2 && parts[1].length) {
				const name = parts[1];

				// nice, there is something usable
				switch (name) {
					case 'l':
					case 'local':
					case 'localhost':
						respond('127.0.0.1', 3600*24);
						break;


					default:
						const ipRegexp = /(\d+\.\d+\.\d+\.\d+)/gi.exec(name);
						if (ipRegexp && ipRegexp.length === 2 && ipRegexp[1].length && net.isIP(ipRegexp[1])) {
							respond(ipRegexp[1], 3600*24);
						}
						else if(/^(.+\.)?(?:l|local|localhost)$/gi.test(name)) {
							respond('127.0.0.1', 3600*24);
						}

						break;
				}
			}
		}
	};
})();
