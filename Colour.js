'use strict';

const values = {
	RESET: 0,
	UNDERSCORE: 4,

	FG_BLACK: 30,
	FG_RED: 31,
	FG_GREEN: 32,
	FG_YELLOW: 33,
	FG_BLUE: 34,
	FG_MAGENTA: 35,
	FG_CYAN: 36,
	FG_WHITE: 37,

	BG_BLACK: 40,
	BG_RED: 41,
	BG_GREEN: 42,
	BG_YELLOW: 43,
	BG_BLUE: 44,
	BG_MAGENTA: 45,
	BG_CYAN: 46,
	BG_WHITE: 47
};

Object.freeze(values);

class Colour{
	static OPTIONS = values;

	static writeColouredText(text, ...params){
		params = params.map(p => this.#getValue(p)).join('');
		console.log(params + text + this.#getValue(values.RESET));
	}

	static #getValue(escape){
		return `\x1b[${escape}m`;
	}
}


module.exports = Colour;