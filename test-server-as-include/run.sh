#!/bin/bash

TMPDIR=$(mktemp -d)

trap "exit 1"         HUP INT PIPE QUIT TERM
trap "rm -rf $TMPDIR" EXIT

BASEDIR=$(dirname $0)

#copy test files to the tmp directory
cp -r ${BASEDIR} $TMPDIR

#pack the server and install from the packed tar file
ORIGINDIR=$(PWD)
PACKEDTARFILE=$(npm pack 2>/dev/null)
cd $TMPDIR/$BASEDIR
npm install
npm install $ORIGINDIR/$PACKEDTARFILE

export SETTINGSDIR=$TMPDIR/settings
mkdir $SETTINGSDIR

node works-as-include.js

