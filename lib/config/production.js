/*
 * 
 * saildata-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>

 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 */

 
 (function() {
	
	"use strict";

	var express = require('express');

	var app 	= this.app;
	var config 	= this.app.config;

	app.configure('production', function() {
		
		config.environment 	= 'production';
		config.debug 		= false;

		app.use(express.errorHandler());
		
		app.all('/', require('../controllers/wifi'));

	});

}).call(global);