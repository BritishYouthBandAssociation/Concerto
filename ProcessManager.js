'use strict';

const { Worker } = require('node:worker_threads');
const Colour = require('./Colour.js');

class ProcessManager {
	#workToDo = [];
	#threads = [];
	#config = {};
	#listeners = {};

	//#stateCheckTimer = null;

	constructor(workToDo, config) {
		console.log(workToDo);
		console.log(config);

		this.#workToDo = workToDo;
		this.#config = config;

		this.#initThreads();
	}

	addEventListener(event, callback){
		event = event.toLowerCase();

		if(!this.#listeners.hasOwnProperty(event)){
			this.#listeners[event] = [callback];
		} else {
			this.#listeners[event].push(callback);
		}
	}

	run(){
		console.time("processing");
		this.#threads.forEach(f => {
			this.#assignWork(f);
		});

		//this.#queryState();
		//clearInterval(this.#stateCheckTimer);
		//this.#stateCheckTimer = setInterval(() => {this.#queryState()}, 5000);
	}

	//#queryState(){
		// this.#threads.forEach(t => {
		// 	t.postMessage({
		// 		type: 'STATUS'
		// 	});
		// });
	//}

	#initThreads() {
		const count = this.#config.count ?? 3;
		for (let i = 0; i < count; i++) {
			const worker = new Worker('./Processor.js', this.#config);
			worker.on("error", (e) => { throw e });
			worker.on("message", msg => this.#handleWorkerResponse(worker, msg));

			this.#threads.push(worker);
		}
	}

	#assignWork(thread){
		if(this.#workToDo.length === 0){
			console.log("No work left");
			thread.postMessage({
				type: 'KILL'
			});

			this.#threads.splice(this.#threads.indexOf(thread), 1);
			if(this.#threads.length === 0){
				this.#finish();
			}

			return;
		}

		const workItem = this.#workToDo.pop();
		workItem.type = 'FILE';
		thread.postMessage(workItem);
	}

	#handleWorkerResponse(thread, msg){
		if(msg.type == 'DONE'){
			this.#assignWork(thread);
		} else if(msg.type == 'STATUS'){
			if(!msg.isWorking){
				Colour.writeColouredText("IDLE THREAD!", Colour.OPTIONS.FG_RED);
			} else {
				const duration = Math.round((performance.now() - msg.start) / 1000);
				Colour.writeColouredText(`Thread working on ${msg.job} (${duration}s)`, Colour.OPTIONS.FG_GREEN);
			}
		} else {
			console.log(msg);
		}
	}

	#finish(){
		//clearInterval(this.#stateCheckTimer);
		console.timeEnd("processing");
		
		if(this.#listeners?.hasOwnProperty("done")){
			this.#listeners["done"].forEach(l => {
				l();
			});
		}
	}
}

module.exports = ProcessManager;