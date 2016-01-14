// depends on:
// DataTables >=1.10.x (https://datatables.net/)
// jQuery-ui-Slider-Pips (https://github.com/simeydotme/jQuery-ui-Slider-Pips/)

;(function ($, document, window, exports) {

    /** Name space to store state
     * TODO: Add these to DataTables namespace like a proper extension
     * @namespace
     */
    var scolumnFilters = {};
    scolumnFilters.widgetArray = [];
    scolumnFilters.defaults = {
        implicit: "auto"
    };

    /* When a Datatable initializes, check to see if it is configured for
     * columnFilters */
    $(document).on( 'init.dt', function (e, settings, json) {
        if ( e.namespace !== 'dt' ) {
            return;
        }

        var opts = settings.oInit.columnFilters;
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
            var data = this.data();
            var controlCell = $('<td></td>'); // jQuery
            if (!isVisible) {
                controlCell.hide();
            }


            /*
             * {
             *   0: { name: 'Range' },
             *   2: 'date',
             *   3: { name: 'Text',
             *        opts: { prefix: '$' }
             *      },
             *   implicit: 'None'
             * }
             */

            // Get widget type based on config options
            var type = (opts[i] && opts[i].name) || (typeof opts[i] === "string" && opts[i])
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
            var widget = new widgetConstructors[type](dTable, data, opts[i] && opts[i].opts);
            controlCell.html(widget.html);
            controlRow.append(controlCell);
            scolumnFilters.widgetArray.push(widget);
        });

        // Add the control row to the table
        header.append(controlRow);

        // Keep control header row in sync with sorting header row column visibility
        dTable.on('column-visibility.dt', function(e, settings, column, state) {
            var col = $(controlRow.children()[column]); // jQuery
            state ? col.show() : col.hide();
        });

        // custom search for filtering via our widgets
        $.fn.dataTable.ext.search.push(
            function( settings, searchData, index, rowData, counter ) {
            // TODO: cache this so we don't recreate the API on every row!
            var api = new $.fn.dataTable.Api(settings);
            var header = $(api.table().header());
            var widgetArray = scolumnFilters.widgetArray;

            if (!widgetArray) { return true; }

            for (var i=0; i < widgetArray.length; i++) {
                var widget = widgetArray[i];
                if (!widget.filter(searchData[i])) {
                    // If ANY filter returns false, then don't show the row
                    return false;
                }
            }
            return true
        });
    }

    /* Every widget constructor is passed a reference to the DataTable API object and the column data, and it must return an object with two properties: 'html' the html element to insert in the control row, and 'filter' a function which is passed a cell value and must return true (show row) or false (hide row)
     * 
     * TODO: need to add a DataTables API call to extend this with more widget types.
     * */
    var widgetConstructors = {
        range: RangeWidget,
        none: NoneWidget,
        date: DateWidget,
        text: TextWidget
    };

    // Construct a Range widget (two-handled slider)
    function RangeWidget(dTable, data, opts) {
        opts = opts || {};
        var slider = $("<div class='range-slider'></div>");
        this.max = opts.max || data.max();
        this.min = opts.min || data.min();
        this.prefix = opts.prefix || '';
        this.suffix = opts.suffix || '';
        this.pips = opts.pips || false;
        var widget = this;

        // Turn it into a jQuery-ui slider
        slider.slider({
            min: this.min,
            max: this.max,
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
        });

        // get HTML from jQuery
        this.html = slider.get();
        this.filter = function(value) {
            value = parseFloat(value);
            var max = this.max;
            var min = this.min;
            if ((isNaN(min) && isNaN(max)) || (isNaN(min) && value <= max) ||
                (min <= value && isNaN(max)) || (min <= value && value <= max + 1))
                {
                    return true;
                }
                return false;
        }
    }

    // Construct a None widget (no widget)
    function NoneWidget() {
        this.html = '';
        this.filter = function() { return true; }
    }

    // Construct a Date widget
    function DateWidget() {
        this.html = 'Date';
        this.filter = function() { return true; }
    }

    // Construct a Text widget
    function TextWidget() {
        this.html = 'Text';
        this.filter = function() { return true; }
    }
    /***
     * DataTable API Plugins
     */

    $.fn.dataTable.Api.register('max()', function() {
        /* NOTE: some JavaScript implementations limit the number of arguments
         * to something like 65,536 -- but if a table is larger than that, it
         * should probably be using server-side processing anyway */
        return Math.max.apply(null, this);
    });

    $.fn.dataTable.Api.register('min()', function() {
        /* NOTE: some JavaScript implementations limit the number of arguments
         * to something like 65,536 -- but if a table is larger than that, it
         * should probably be using server-side processing anyway */
        return Math.min.apply(null, this);
    });

})(jQuery, document, window);
