/**@license
 *       __ _____                     ________                              __
 *      / // _  /__ __ _____ ___ __ _/__  ___/__ ___ ______ __ __  __ ___  / /
 *  __ / // // // // // _  // _// // / / // _  // _//     // //  \/ // _ \/ /
 * /  / // // // // // ___// / / // / / // ___// / / / / // // /\  // // / /__
 * \___//____ \\___//____//_/ _\_  / /_//____//_/ /_/ /_//_//_/ /_/ \__\_\___/
 *           \/              /____/
 * http://terminal.jcubic.pl
 *
 * This is example of how to create less like command for jQuery Terminal
 * the code is based on the one from leash shell and written as jQuery plugin
 *
 * Copyright (c) 2018-2019 Jakub Jankiewicz <https://jcubic.pl/me>
 * Released under the MIT license
 *
 */
/* global define, global, require, module, Image, URL */
(function(factory, undefined) {
    var root = typeof window !== 'undefined' ? window : global;
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        // istanbul ignore next
        define(['jquery', 'jquery.terminal'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node/CommonJS
        module.exports = function(root, jQuery) {
            if (jQuery === undefined) {
                // require('jQuery') returns a factory that requires window to
                // build a jQuery instance, we normalize how we use modules
                // that require this pattern but the window provided is a noop
                // if it's defined (how jquery works)
                if (window !== undefined) {
                    jQuery = require('jquery');
                } else {
                    jQuery = require('jquery')(root);
                }
            }
            if (!jQuery.fn.terminal) {
                if (window !== undefined) {
                    require('jquery.terminal');
                } else {
                    require('jquery.terminal')(jQuery);
                }
            }
            factory(jQuery);
            return jQuery;
        };
    } else {
        // Browser
        // istanbul ignore next
        factory(root.jQuery);
    }
})(function($) {
    var img_split_re = /(\[\[(?:@|[^;])*;[^;]*;[^\]]*\]\])/;
    var img_re = /\[\[(?:@|[^;])*;[^;]*;[^;]*;[^;]*;([^;]*)\]\]/;
    // slice images into terminal lines - each line is unique blob url

    function slice_image(img_data, width, y1, y2) {
        // render slice on canvas and get Blob Data URI
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = y2 - y1;
        ctx.putImageData(img_data, 0, 0);
        var defer = $.Deferred();
        canvas.toBlob(function(blob) {
            defer.resolve(URL.createObjectURL(blob));
        });
        return defer.promise();
    }
    function slice(src, options) {
        var settings = $.extend({
            width: null,
            line_height: null
        }, options);
        var img = new Image();
        var defer = $.Deferred();
        var slices = [];
        img.onload = function() {
            var height, width;
            if (settings.width < img.width) {
                height = (img.height * settings.width) / img.width;
                width = settings.width;
            } else {
                height = img.height;
                width = img.width;
            }
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            canvas.width = width;
            canvas.height = height;
            // scale the image to fit the terminal
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, width, height);
            (function recur(start) {
                // loop over slices
                if (start < height) {
                    var y1 = start, y2 = start + settings.line_height;
                    if (y2 > height) {
                        y2 = height;
                    }
                    var img_data = ctx.getImageData(0, y1, width, y2);
                    slice_image(img_data, width, y1, y2).then(function(uri) {
                        slices.push(uri);
                        recur(y2);
                    });
                } else {
                    defer.resolve(slices);
                }
            })(0);
        };
        // images need to have CORS if on different server,
        // without this it will throw error
        img.crossOrigin = "anonymous";
        img.src = src;
        return defer.promise();
    }
    // -----------------------------------------------------------------------------------
    function less(term, text, options) {
        var export_data = term.export_view();
        var cols, rows;
        var pos = 0;
        var original_lines;
        var lines;
        var prompt = '';
        var left = 0;
        var $output = term.find('.terminal-output');
        var cmd = term.cmd();
        function print() {
            term.clear();
            if (lines.length - pos > rows - 1) {
                prompt = ':';
            } else {
                prompt = '[[;;;cmd-inverted](END)]';
            }
            term.set_prompt(prompt);
            var to_print = lines.slice(pos, pos + rows - 1);
            to_print = to_print.map(function(line) {
                if ($.terminal.length(line) > cols) {
                    return $.terminal.substring(line, left, left + cols - 1);
                }
                return line;
            });
            if (to_print.length < rows - 1) {
                while (rows - 1 > to_print.length) {
                    to_print.push('~');
                }
            }
            term.echo(to_print.join('\n'));
        }
        function quit() {
            term.pop().import_view(export_data);
            clear_cache();
            $output.css('height', '');
            if ($.isFunction(options.exit)) {
                options.exit();
            }
        }
        var cache = {};
        function clear_cache() {
            Object.keys(cache).forEach(function(width) {
                Object.keys(cache[width]).forEach(function(img) {
                    cache[width][img].forEach(function(uri) {
                        URL.revokeObjectURL(uri);
                    });
                });
            });
            cache = {};
        }
        function fixed_output() {
            // this will not change on resize, but the font size may change
            var height = cmd.outerHeight(true);
            $output.css('height', 'calc(100% - ' + height + 'px)');
        }
        function refresh_view() {
            cols = term.cols();
            rows = term.rows();
            fixed_output();
            function run(arg) {
                var text;
                if (arg instanceof Array) {
                    if (options.formatters) {
                        text = arg.join('\n');
                    } else {
                        original_lines = arg;
                    }
                } else {
                    text = arg;
                }
                if (text) {
                    if (options.formatters) {
                        text = $.terminal.apply_formatters(text);
                    }
                    // split images
                    var defer = $.Deferred();
                    var parts = text.split(img_split_re).filter(Boolean);
                    var promise = defer.promise();
                    if (parts.length === 1) {
                        defer.resolve(parts);
                    } else {
                        var result = [];
                        (function recur() {
                            function concat_slices(slices) {
                                cache[width][img] = slices;
                                result = result.concat(slices.map(function(uri) {
                                    return '[[@;;;;' + uri + ']]';
                                }));
                                recur();
                            }
                            if (!parts.length) {
                                return defer.resolve(result);
                            }
                            var part = parts.shift();
                            var m = part.match(img_re);
                            if (m) {
                                var img = m[1];
                                var cursor = term.find('.cmd-cursor')[0];
                                var rect = cursor.getBoundingClientRect();
                                var width = term.width();
                                var opts = {width: width, line_height: rect.height};
                                cache[width] = cache[width] || {};
                                if (cache[width][img]) {
                                    concat_slices(cache[width][img]);
                                } else {
                                    slice(img, opts).then(concat_slices);
                                }
                            } else {
                                result = result.concat(part.split('\n'));
                                recur();
                            }
                        })();
                    }
                    promise.then(function(l) {
                        original_lines = l;
                        lines = original_lines.slice();
                        print();
                    });
                } else {
                    lines = original_lines.slice();
                    print();
                }
            }
            if ($.isFunction(text)) {
                text(cols, run);
            } else {
                run(text);
            }
        }
        refresh_view();
        var scroll_by = 3;
        //term.on('mousewheel', wheel);
        var in_search = false, last_found, search_string;
        function search(start, reset) {
            var escape = $.terminal.escape_brackets(search_string),
                flag = search_string.toLowerCase() === search_string ? 'i' : '',
                start_re = new RegExp('^(' + escape + ')', flag),
                index = -1,
                prev_format = '',
                formatting = false,
                in_text = false;
            lines = original_lines.slice();
            if (reset) {
                index = pos = 0;
            }
            for (var i = 0; i < lines.length; ++i) {
                var line = lines[i];
                for (var j = 0, jlen = line.length; j < jlen; ++j) {
                    if (line[j] === '[' && line[j + 1] === '[') {
                        formatting = true;
                        in_text = false;
                        start = j;
                    } else if (formatting && line[j] === ']') {
                        if (in_text) {
                            formatting = false;
                            in_text = false;
                        } else {
                            in_text = true;
                            prev_format = line.substring(start, j + 1);
                        }
                    } else if (formatting && in_text || !formatting) {
                        if (line.substring(j).match(start_re)) {
                            var rep;
                            if (formatting && in_text) {
                                rep = '][[;;;inverted]$1]' + prev_format;
                            } else {
                                rep = '[[;;;inverted]$1]';
                            }
                            line = line.substring(0, j) +
                                line.substring(j).replace(start_re, rep);
                            j += rep.length - 2;
                            if (i > pos && index === -1) {
                                index = pos = i;
                            }
                        }
                    }
                }
                lines[i] = line;
            }
            print();
            term.set_command('');
            term.set_prompt(prompt);
            return index;
        }
        term.push($.noop, {
            onResize: refresh_view,
            mousewheel: function(event, delta) {
                if (delta > 0) {
                    pos -= scroll_by;
                    if (pos < 0) {
                        pos = 0;
                    }
                } else {
                    pos += scroll_by;
                    if (pos - 1 > lines.length - rows) {
                        pos = lines.length - rows + 1;
                    }
                }
                print();
                return true;
            },
            name: 'less',
            keydown: function(e) {
                var command = term.get_command();
                if (term.get_prompt() !== '/') {
                    if (e.which === 191) {
                        term.set_prompt('/');
                    } else if (in_search &&
                               $.inArray(e.which, [78, 80]) !== -1) {
                        if (e.which === 78) { // search_string
                            if (last_found !== -1) {
                                last_found = search(last_found + 1);
                            }
                        } else if (e.which === 80) { // P
                            last_found = search(0, true);
                        }
                    } else if (e.which === 81) { //Q
                        quit();
                    } else if (e.which === 39) { // right
                        left += Math.round(cols / 2);
                        print();
                    } else if (e.which === 37) { // left
                        left -= Math.round(cols / 2);
                        if (left < 0) {
                            left = 0;
                        }
                        print();
                        // scroll
                    } else if (lines.length > rows) {
                        if (e.which === 38) { //up
                            if (pos > 0) {
                                --pos;
                                print();
                            }
                        } else if (e.which === 40) { //down
                            if (pos <= lines.length - rows) {
                                ++pos;
                                print();
                            }
                        } else if (e.which === 34) {
                            // Page up
                            pos += rows;
                            var limit = lines.length - rows + 1;
                            if (pos > limit) {
                                pos = limit;
                            }
                            print();
                        } else if (e.which === 33) {
                            //Page Down
                            pos -= rows;
                            if (pos < 0) {
                                pos = 0;
                            }
                            print();
                        }
                    }
                    if (!e.ctrlKey && !e.alKey) {
                        return false;
                    }
                    // search
                } else if (e.which === 8 && command === '') {
                    // backspace
                    term.set_prompt(prompt);
                } else if (e.which === 13) { // enter
                    // basic search find only first
                    if (command.length > 0) {
                        in_search = true;
                        pos = 0;
                        search_string = command;
                        last_found = search(0);
                    }
                    return false;
                }
            },
            prompt: prompt
        });
    }
    // -----------------------------------------------------------------------------------
    $.fn.less = function(text, options) {
        var settings = $.extend({
            onExit: $.noop,
            formatters: false
        }, options);
        if (!(this instanceof $.fn.init && this.terminal)) {
            throw new Error('This plugin require jQuery Terminal');
        }
        var term = this.terminal();
        if (!term) {
            throw new Error(
                'You need to invoke this plugin on selector that have ' +
                'jQuery Terminal or on jQuery Terminal instance'
            );
        }
        less(term, text, settings);
    };
});
