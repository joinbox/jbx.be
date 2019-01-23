import net from 'net';
import log from 'ee-log';
import dnsd from 'dnsd';
import dns from 'dns';



export default class DNSServer {


	constructor() {
		this.port = 53;
		this.domain = null;

		// get options from args
		this.parseARGVOptions();


		// set up the regexp to use to parse the queries
		if (this.domain === null) this.regexp = /^(.+)\..+\..+$/gi;
		else this.regexp = new RegExp(`^(.+)\\.${this.domain.replace('.', '\\.')}$`, 'gi');


		this.server = dnsd.createServer((request, response) => {
			this.handleRequest(request, response).catch(e => log(e));
		});

		this.server.listen(this.port);


		log.success(`Server is listening on port ${this.port} using ${(this.domain === null ? 'any x.y domain' : `the domain ${this.domain}`)}`);


		this.server.on('error', log);
	}




	/**
	 * gets the port and the domain from the argv array
	 */
	parseARGVOptions() {
		process.argv.filter((v) => {
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
	}




	/**
	 * handles all incoming dns requests
	 *
	 * @param      {Object}  request   The dns request
	 * @param      {Object}  response  The dns response
	 */
	async handleRequest(request, response) {

		for (const question of request.question) {
			let answers = [];

			// just handle  a few selected in queries
			if (question.class === 'IN') {
				switch (question.type) {
					case 'A':
						answers = await this.handleARequest(question);
						break;

					case 'NS':
						answers = await this.handleNSRequest(question);
						break;

					case 'CNAME':
						answers = await this.handleCNAMERequest(question);
						break;

					case 'SOA':
						answers = await this.handleSOARequest(question);
						break;
				}
			}


			for (const answer of answers) {
				response.answer.push({
					name: answer.name || question.name,
					type: answer.type || question.type,
					class: answer.class || question.class,
					ttl: answer.ttl || 60,
					data: answer.value,
				});
			}
		}

		response.end();
	}




	/**
	 * serve our own ns records
	 *
	 * @param      {object}    question  dns question
	 */
	async handleNSRequest(question) {
		return [{
			value: 'dns.dnsporn.joinbox.com',
		}, {
			value: 'dns.dnsporn.joinbox.ch',
		}];
	}





	/**
	 * our own soa record
	 *
	 * @param      {object}    question  The dns question
	 */
	async handleSOARequest(question) {
		return [{
			value: {
				mname: 'dns.dnsporn.joinbox.com.',
				rname:'hosting.joinbox.com.',
				serial: 1483995988,
				refresh: 86400,
				retry: 7200,
				expire: 604800,
				ttl: 604800,
			}
		}];
	}





	/**
	 * answer the dynamic requests
	 *
	 * @param      {Object}    question  the dns question
	 */
	async handleARequest(question) {


		// look, how ugly this is :D
		if (question.name === 'jbx.be' || question.name === 'www.jbx.be') {

			// resolve the cname to our s3 bucket, return it as a record
			const bucket = 'jbx.be.s3-website-eu-west-1.amazonaws.com';
			const ips = await this.resolve(bucket);

			return ips.map(ip => ({
				value: ip,
				ttl: 300,
			}));
		} else {

			// parse dns parts, reset regexp
			this.regexp.lastIndex = 0;
			const parts = this.regexp.exec(question.name);


			// valid dns.porn request
			if (parts && parts.length === 2 && parts[1].length) {
				const name = parts[1];

				// nice, there is something usable
				switch (name) {
					case 'l':
					case 'local':
					case 'localhost':
						return [{
							value: '127.0.0.1',
							ttl: 3600*24,
						}];


					default:
						const ipRegexp = /(\d+\.\d+\.\d+\.\d+)/gi.exec(name);

						if (ipRegexp && ipRegexp.length === 2 && ipRegexp[1].length && net.isIP(ipRegexp[1])) {
							return [{
								value: ipRegexp[1],
								ttl: 3600*24,
							}];
						}
						else if(/^(.+\.)?(?:l|local|localhost)$/gi.test(name)) {
							return [{
								value: '127.0.0.1',
								ttl: 3600*24,
							}];
						}

						break;
				}
			}
		}


		return [];
	}



	/**
	 * answer the dynamic requests
	 *
	 * @param      {Object}    question  the dns question
	 */
	async handleCNAMERequest(question) {


		// look, how ugly this is :D
		if (question.name === '_f8299e39171b0834b0b6bb1cbdbf94cb.jbx.be') {
			return [{
				value: '_9cda1ba78d5a25e99aa1d08796d30216.hkvuiqjoua.acm-validations.aws',
				ttl: 300,
			}];
		} else if (question.name === '_35f3e24e1ec70e5c98a93dd11336d495.www.jbx.be') {
			return [{
				value: '_c9eea948eb1b670e06af8a4e78de8030.hkvuiqjoua.acm-validations.aws',
				ttl: 300,
			}];
		}

		return [];
	}





	/**
	 * resolve a name ot a v4 address
	 *
	 * @param      {string}   hostname  The hostname to resolve
	 * @return     {Promise}  array of ips
	 */
	resolve(hostname) {
		return new Promise((resolve, reject) => {
			dns.resolve4(hostname, (err, addresses) => {
				if (err) reject(err);
				else resolve(addresses);
			});
		});
	}
}
