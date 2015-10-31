var request = require('request');
var argv = require('minimist')(process.argv.slice(2));

var WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
var RAND_PARAMS = {
    'action':'query',
    'list':'random',
    'rnlimit':1,
    'rnnamespace':0,
    'rawcontinue':1,
    'format':'json'
};

var DESTINATIONS = {
    'hitler': {
        'destination': 'Adolf Hitler',
        'dest_alt': 'Hitler',
        'dest_regex': '/(?:(?:adolf)*[_\\ ]+)*hitler/i'
    },
    'jesus': {
        'destination': 'Jesus',
        'dest_alt': 'Jesus Christ',
        'dest_regex': '/jesus(?:[_\\ ]+(?:christ)*)*/i'
    }
};

// get arguments
var start_page = argv['start'];
var mode = argv['mode'] !== undefined ? argv['mode'] : 'json';
var max_depth = (argv['depth'] !== undefined)
             && (typeof argv['depth'] === 'number')
             && (argv['depth'] % 1 === 0) ? argv['depth'] : 4;
var dest = argv['dest'] !== undefined ? argv['dest'].toLowerCase() : 'hitler';

if (DESTINATIONS[dest] === undefined) {
    process.stdout.write('BAD_DEST_ERROR');
    process.exit();
}
var destination = DESTINATIONS[dest]['destination'];
var dest_alt = DESTINATIONS[dest]['dest_alt'];
var dest_regex = new RegExp(DESTINATIONS[dest]['dest_regex']);

var visitedPages = [];
var found_hitler = false;

var launch = function(title, customTitle) {
    if (mode === 'cmdline') {
        console.log('Starting page is: ' + title);
        console.log('Thinking...');
    }
    visitedPages.push(title);
    // if we get the ending page as the start page... well we're done aren't we?
    if (dest_regex.test(title)) {
        printResults([destination]);
        process.exit();
    }
    getLinks(title, max_depth, [], customTitle);
};

var getStartingPage = function(title) {
    if (title) {
        launch(title, true);
    } else {
        request.get({url:WIKIPEDIA_API_URL, qs:RAND_PARAMS}, function(error, response, body) {
            var obj = JSON.parse(body);
            title = obj.query.random[0].title;
            launch(title, false);
        });
    }
};

var buildParams = function(title) {
    return {
        'action':'parse',
        'page':title,
        'prop':'links',
        'format':'json'
    };
};

var parseTitle = function(obj) {
    if (obj.error && obj.error.code === 'missingtitle') {
        return false;
    }
    return obj.parse.title;
};

var parseLinks = function(obj, redirect_check) {
    var namespace = 0;
    links_raw = obj.parse.links;
    links = links_raw.filter(function(f) {
        if (!redirect_check) {
            return (f['ns'] === namespace && f['exists'] !== undefined);
        } else {
            return (f['exists'] !== undefined);
        }
    }).map(function(m){
        return m['*'];
    });

    if (!redirect_check) {
        return links;
    }
    else {
        return ((links.indexOf('Template:R from modification') !== -1)
            || (links.indexOf('Template:R from long name') !== -1)
            || (links.indexOf('Template:R from short name') !== -1)
            || (links.indexOf('Template:R from other capitalisation') !== -1)
            || (links.indexOf('Template:R from plural') !== -1)
            || (links.indexOf('Template:R from incorrect name') !== -1)
            || (links.indexOf('Category:Redirects from other capitalisations') !== -1)
            || (links.indexOf('Category:Redirects from surnames') !== -1)
            || (links.indexOf('Category:Redirects from alternative names') !== -1)
            || (links.indexOf('Category:Redirects from modifications') !== -1)
            || (links.indexOf('Wikipedia:Common names') !== -1)
            || (links.indexOf('Wikipedia:Piped link') !== -1))
    }
};

var printResults = function(results) {
    if (mode === 'cmdline') {
        res_str = '(START) ';
        for (var i in results) {
            if (i > 0 && i < (results.length)) {
                res_str = res_str + ' --' + i + '--> ';
            }
            res_str = res_str + results[i];
        }
        res_str = res_str + ' (FINISH)';
        console.log('HITLER FOUND!')
        console.log('=============================================');
        console.log(res_str);
        console.log('---------------------------------------------');
        console.log('Found in ' + (results.length-1) + ' step(s).');
        console.log('=============================================');
    }
    if (mode === 'json') {
        process.stdout.write(JSON.stringify(results))
    }
};

var getLinks = function(title, depth, path, customTitle) {
    request.get({url:WIKIPEDIA_API_URL, qs:buildParams(title)}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            jsonData = JSON.parse(body);

            if (customTitle) {
                // title could have underscores or improper capitalization, so get it from api data
                fixed_title = parseTitle(jsonData);
                // fix 'visited' array too
                visitedPages[visitedPages.indexOf(title)] = fixed_title;
            } else {
                fixed_title = title;
            }

            if (!fixed_title) {
                // page doesn't exist
                if (mode === 'cmdline') {
                    console.log('ERROR: Page \"' + title + '\" does not exist');
                }
                if (mode === 'json') {
                    process.stdout.write('NO_EXIST_ERROR');
                }
                process.exit();
            }

            // if a custom start was given, on the first page 
            //  do redirect check before pushing to the path
            new_path = path.slice();
            if (depth === max_depth && customTitle && parseLinks(jsonData, true)) {
                // don't add to path because this is a redirect
            } else {
                new_path.push(fixed_title);
            }
            
            // pull links out
            links = parseLinks(jsonData, false);
            
            if (links.indexOf(destination) !== -1 || links.indexOf(dest_alt) !== -1) {
                new_path.push(destination);
                found_hitler = true;
                printResults(new_path);
                process.exit();
            }

            // if we start on a dead end page (no links), abort
            if (links.length === 0) {
                if (depth === max_depth) {
                    process.stdout.write('DEAD_END_ERROR');
                    process.exit();
                }
                return;
            }

            for (var l in links) {
                if (depth > 0) {
                    if (visitedPages.indexOf(links[l]) === -1 && !found_hitler) {
                        // add to the 'visited' array early to avoid waiting for the req
                        //  to finish before adding, avoid dupes
                        visitedPages.push(links[l]);
                        getLinks(links[l], depth-1, new_path, customTitle);
                    }
                } else {
                    if (mode === 'cmdline') {
                        console.log('ERROR: Maximum depth exceeded (Max depth = ' + max_depth + ')');
                    }
                    if (mode === 'json') {
                        process.stdout.write('MAX_DEPTH_ERROR');
                    }
                    process.exit();
                }
            } 
        }  
    });
};

var main = function() {
    if (mode !== 'cmdline' && mode !== 'json') {
        process.stdout.write('BAD_MODE_ERROR');
        process.exit();
    }
    if (start_page) {
        ('Start page specified!');
    }
    getStartingPage(start_page);
};

if(require.main === module) {
    main();
};


