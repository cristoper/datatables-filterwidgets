// depends on:
// DataTables >=1.10.x (https://datatables.net/)
// jQuery-ui-Slider-Pips (https://github.com/simeydotme/jQuery-ui-Slider-Pips/)

;(function ($, document, window, exports) {

    var colfil_columns;

    /** Name space to store state
     * TODO: Add these to DataTables namespace like a proper extension
     * @namespace
     */
    var scolumnFilters = {};
    scolumnFilters.widgetArray = [];
    scolumnFilters.defaults = {
        implicit: "auto"
    };

    // Catch the 'resposnive-resize' events which fire before the 'init.dt' event
    $(document).on('responsive-resize.dt', function(e, datatable, columns) {
        colfil_columns = columns;
    });

    /* When a Datatable initializes, check to see if it is configured for
     * columnFilters */
    $(document).on( 'init.dt', function (e, settings, json) {
        if ( e.namespace !== 'dt' ) {
            return;
        }

        var opts = settings.oInit.columnFilters;
        if (opts === true) { opts = {}; }
        $.extend(opts, scolumnFilters.defaults);

        if (opts) {
            addColumnFilters(settings, opts);
        }
    });


    function addColumnFilters(settings, opts) {

        var dTable = $.fn.dataTable.Api(settings);
        var header = $(dTable.table().header()); // jQuery
        var controlRow = $('<tr id="columnFiltersRow"></tr>');


        dTable.columns().every(function() {
            // create a control column for every table column
            var i = this.index();
            var isVisible = this.visible();
            var colType = settings.aoColumns[i].sType;
            var controlCell = $('<td></td>'); // jQuery
            if (!isVisible) {
                controlCell.hide();
            }


            /*
             * {
             *   0: { type: 'Range' },
             *   2: 'date',
             *   3: { type: 'Text',
             *        opts: { prefix: '$' }
             *      },
             *   implicit: 'None'
             * }
             */

            // Get widget type based on config options
            var type = (opts[i] && opts[i].type) || (typeof opts[i] === "string" && opts[i])
                || opts.implicit || 'none';
                type = type.toLowerCase();
                if (type == "auto") {
                    // See: https://datatables.net/reference/option/columns.type
                    switch (colType) {
                        case "date":
                            type = "date";
                        break;
                        case "num":
                            type = "range";
                        break;
                        default:
                            type = "text";
                    }
                }

                // Add the widgets
                var widget = new widgetConstructors[type](dTable, i, opts[i] && opts[i].opts);
                controlCell.html(widget.html);
                controlRow.append(controlCell);
                scolumnFilters.widgetArray.push(widget);
        });

        // Hide any columns already hidden by the Responsive extension
        if (colfil_columns.length) {
            show_hide_columns(colfil_columns);
        }

        // Add the control row to the table
        header.append(controlRow);

        // Keep control header row in sync with sorting header row column visibility
        dTable.on('column-visibility.dt', function(e, settings, column, state) {
            var col = $(controlRow.children()[column]); // jQuery
            state ? col.show() : col.hide();
        });

        // Keep in sync with visibility controlled by Responsive extension
        $(document).off('responsive-resize.dt');
        dTable.on('responsive-resize.dt', function(e, datatable, columns) {
            show_hide_columns(columns);
        });

        // custom search for filtering via our widgets
        $.fn.dataTable.ext.search.push(
            function(settings, searchData, index, rowData, counter) {
            // TODO: cache this so we don't recreate the API on every row!
            var api = new $.fn.dataTable.Api(settings);
            var header = $(api.table().header());
            var widgetArray = scolumnFilters.widgetArray;

            if (!widgetArray) { return true; }

            for (var i=0; i < widgetArray.length; i++) {
                var widget = widgetArray[i];
                if (widget.filter && !widget.filter(searchData[i])) {
                    // If ANY filter returns false, then don't show the row
                    return false;
                }
            }
            return true
        });

        /** Show/hide control columns based on an array of booleans (true=show; false=hide)
         *
         * @param {Array} columns
         */
        function show_hide_columns(columns) {
            columns.forEach(function(is_visible, index) {
                var col = $(controlRow.children()[index]);
                is_visible ? col.show() : col.hide();
            });
        }
    }

    /* Every widget constructor is passed a reference to the DataTable API object, the column index, and any options passed during configuration, and it must return an object with two properties: 'html' the html element to insert in the control row, and 'filter' a function which is passed a cell value and must return true (show row) or false (hide row)
     * 
     * TODO: need to add a DataTables API call to extend this with more widget types.
     * */
    var widgetConstructors = {
        range: RangeWidget,
        none: NoneWidget,
        date: DateWidget,
        text: TextWidget,
        select: SelectWidget
    };

    // Construct a Range widget (two-handled slider)
    function RangeWidget(dTable, colIndex, opts) {
        opts = opts || {};
        var data = dTable.column(colIndex).data();
        var slider = $("<div class='range-slider'></div>");
        this.numSteps = opts.numSteps || 10;
        this.min = opts.min || data.min();
        // The maximum calculation depends on numSteps and min:
        this.max = opts.max || calcEvenMax(data.max(), this.min, this.numSteps);
        // The step size depends on the (even) max, min and numSteps
        this.step = opts.step || calcStepSize(this.max, this.min, this.numSteps);
        this.defaults = opts.defaults || [this.min, this.max];
        this.prefix = opts.prefix || '';
        this.suffix = opts.suffix || '';
        this.pips = opts.pips || false;
        var widget = this;

        // Turn it into a jQuery-ui slider
        slider.slider({
            min: this.min,
            max: this.max,
            step: this.step,
            values: [this.min, this.max],
            range: true,
            slide: function(e, ui) {
                var value = ui.values;
                widget.min = value[0];
                widget.max = value[1];
                dTable.draw();
            }
        }).slider("float", {
            prefix: this.prefix,
            suffix: this.suffix,
            formatLabel: formatLabel
        });

        // get HTML from jQuery
        this.html = slider.get();

        /** Called by custom filter whenever DataTable is drawn
         *
         * @param {Number} value - the value in the table cell. We test this
         * value against the slider's set range.
         * @returns {Bool} false if the value is outside of range, true if it
         * is within the range.
         */
        this.filter = function(value) {
            value = parseFloat(value);
            var max = this.max;
            var min = this.min;

            // Range filters are not concerned with NaNs, so let them pass
            if (isNaN(value)) {
                return true;
            }

            return (min <= value && value <= max);
        }

        /*** Helper Functions (used by above code) ***/

        /** calculate a reasonable step size
         *
         * @param {Number} max - the maximum of the dataset
         * @param {Number} min - the minimum of the dataset
         * @returns {Number} The stepsize to use
         */
        function calcStepSize(max, min, numSteps) {
            return Math.floor((max-min)/10);
        }

        /** Calculate a new maximum so that (max-min) is evenly divided by
         * this.steps
         *
         * @param {Number} max - the original maximum value
         * @returns {Number} the new (larger) maximum value
         */
        function calcEvenMax(max, min, numSteps) {
            var modulus = (max-min) % numSteps;
            var diff = numSteps - modulus;
            return max + diff;
        }

        /** Make numbers short and readable for printing on slider float
        */
        function formatLabel(val) {
            return this.prefix + shortenLargeNumber(val,0) + this.suffix;
        }

        /** Taken from:
         * @see http://stackoverflow.com/a/28608086/408930
         *
         * Shorten number to thousands, millions, billions, etc.
         * @see http://en.wikipedia.org/wiki/Metric_prefix
         *
         * @param {number} num Number to shorten.
         * @param {number} [digits=0] The number of digits to appear after the decimal point.
         * @returns {string|number}
         *
         * @example
         * // returns '12.5k'
         * shortenLargeNumber(12543, 1)
         *
         * @example
         * // returns '-13k'
         * shortenLargeNumber(-12567)
         *
         * @example
         * // returns '51M'
         * shortenLargeNumber(51000000)
         *
         * @example
         * // returns 651
         * shortenLargeNumber(651)
         *
         * @example
         * // returns 0.12345
         * shortenLargeNumber(0.12345)
         */
        function shortenLargeNumber(num, digits) {
            var units = ['k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'],
            decimal;

            for(var i=units.length-1; i>=0; i--) {
                decimal = Math.pow(1000, i+1);

                if(num <= -decimal || num >= decimal) {
                    return +(num / decimal).toFixed(digits) + units[i];
                }
            }
            return num;
        }


    }

    // Construct a None widget (no widget)
    function NoneWidget() {
        this.html = '';
        this.filter = function() { return true; }
    }

    // Construct a Text widget
    function TextWidget(dTable, colIndex, opts) {
        var input = $("<input type='search'></input>");

        // Note that the oninput event is supported by IE9+
        // (but is buggy in IE9 (http://help.dottoro.com/ljhxklln.php)
        input.on("input", function() {
            dTable.column(colIndex).search(this.value).draw()
            $(this).focus();
        });
        this.html = input;
    }

    /**
     *
     * opts.options - an array of options. If opts is not given, then a
     * list will be built automatically from the unique strings in the column
     * data.
     */
    function SelectWidget(dTable, colIndex, opts) {
        opts = opts || {};
        var column = dTable.column(colIndex);
        var data = column.data();
        var optsArray = opts.options || data.unique();
        var select = $("<select></select>");
        select.append("<option>All</option>");

        // build the list
        $.each(optsArray.sort(), function(index, option) {
            select.append("<option>"+option+"</option>");
        });

        this.html = select;

        // Update the table when a selection is made
        select.change(function() { dTable.draw(); });

        /* Filter out any rows which don't match the selection exactly, apart
         * from case.
         */
        this.filter = function(value) {
            var selection = select.val().toLowerCase();
            value = value.toLowerCase();
            if (selection === "all") {
                return true;
            }
            return (selection == value);
        }

    }

    // Construct a Date widget
    function DateWidget() {
        this.html = 'Date';
        this.filter = function() { return true; }
    }


    /***
     * DataTable API Plugins
     */

    $.fn.dataTable.Api.register('max()', function() {
        /* NOTE: some JavaScript implementations limit the number of arguments
         * to something like 65,536 -- but if a table is larger than that, it
         * should probably be using server-side processing anyway */
        var numArray = this.filter(function(element) { return !isNaN(element) });
        return Math.max.apply(null, numArray);
    });

    $.fn.dataTable.Api.register('min()', function() {
        /* NOTE: some JavaScript implementations limit the number of arguments
         * to something like 65,536 -- but if a table is larger than that, it
         * should probably be using server-side processing anyway */
        var numArray = this.filter(function(element) { return !isNaN(element) });
        return Math.min.apply(null, numArray);
    });

})(jQuery, document, window);
