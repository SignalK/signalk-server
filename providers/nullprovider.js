/*
 *
 * prototype-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2017 Teppo Kurki <teppo.kurki@iki.fi>.
 *
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

const Transform = require("stream").Transform;

function NullProvider(options) {
  Transform.call(this, {
    objectMode: true
  });
}

require("util").inherits(NullProvider, Transform);

module.exports = NullProvider;
