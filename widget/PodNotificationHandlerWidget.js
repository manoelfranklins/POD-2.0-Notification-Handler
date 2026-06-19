sap.ui.define([
    "sap/dm/dme/pod2/widget/Widget",
    "sap/dm/dme/pod2/context/PodContext",
    "sap/dm/dme/pod2/model/I18nResourceModel",
    "sap/dm/dme/pod2/widget/metadata/WidgetProperty",
    "sap/dm/dme/pod2/widget/metadata/WidgetEvent",
    "sap/dm/dme/pod2/propertyeditor/StringPropertyEditor",
    "sap/dm/dme/pod2/propertyeditor/PropertyEditor",
    "sap/dm/dme/pod2/propertyeditor/PropertyCategory",
    "sap/dm/dme/pod2/context/ModelPath",
    "sap/dm/dme/pod2/notification/PodNotificationWebSocket",
    "sap/dm/dme/pod2/notification/EventType",
    "sap/dm/dme/pod2/notification/Filter",
    "sap/dm/dme/pod2/Logger",
    "sap/dm/dme/pod2/control/CustomPanel",
    "sap/ui/base/Event",
    "sap/ui/model/json/JSONModel",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/Title",
    "sap/m/List",
    "sap/m/StandardListItem",
    "sap/m/Toolbar",
    "sap/m/ToolbarSpacer",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/FormattedText"
], (
    Widget,
    PodContext,
    I18nResourceModel,
    WidgetProperty,
    WidgetEvent,
    StringPropertyEditor,
    PropertyEditor,
    PropertyCategory,
    ModelPath,
    PodNotificationWebSocket,
    EventType,
    Filter,
    Logger,
    CustomPanel,
    UIEvent,
    JSONModel,
    VBox,
    Text,
    Title,
    List,
    StandardListItem,
    Toolbar,
    ToolbarSpacer,
    Button,
    Label,
    FormattedText
) => {
    "use strict";

    // ---------------------------------------------------------------------------
    // StaticInfoEditor — a read-only PropertyEditor that renders a styled info
    // block below another property row. It holds no value; it only displays text.
    // ---------------------------------------------------------------------------
    class StaticInfoEditor extends PropertyEditor {
        #oControl = null;
        #sHtml    = "";

        constructor(oWidget, sHtmlContent) {
            // Pass the widget as the accessor (required — must not be null).
            // "__staticInfo__" is a dummy property ID; _getPropertyValue /
            // _setPropertyValue are never called because we override getControl().
            super(oWidget, "__staticInfo__");
            this.#sHtml = sHtmlContent || "";
        }

        // Return an empty Label so the property row has no left-column label text
        _createLabel() {
            return new Label({ text: "" });
        }

        // The right-column control is a FormattedText rendering the info HTML
        getControl() {
            if (!this.#oControl) {
                this.#oControl = new FormattedText({
                    htmlText: this.#sHtml,
                    width: "100%"
                }).addStyleClass("sapUiTinyMarginTop");
            }
            return this.#oControl;
        }
    }

    /**
     * POD Notification Handler Widget
     * Subscribes to custom POD notifications by event name and displays
     * a live log. Fires an On Receive event per configured event name.
     *
     * @alias custom.pod2.podNotificationHandler.widget.PodNotificationHandlerWidget
     * @extends sap.dm.dme.pod2.widget.Widget
     */
    class PodNotificationHandlerWidget extends Widget {

        static #oI18nModel = new I18nResourceModel({
            bundleName: "custom.pod2.podNotificationHandler.i18n.i18n"
        });

        static getI18nModel() { return this.#oI18nModel; }
        static getDisplayName() { return "POD Notification Handler"; }
        static getIcon() { return "sap-icon://bell"; }
        static getCategory() { return "Custom Widgets"; }
        static getDescription() { return "Subscribes to custom POD notifications and fires events for each configured event name."; }

        static getDefaultConfig() {
            return { properties: { eventNames: "" } };
        }

        PropertyId = Object.freeze({ EventNames: "eventNames" });

        #oLog = Logger.getLogger("custom.pod2.podNotificationHandler.widget.PodNotificationHandlerWidget");
        #aSubscriptions = [];
        #oLogModel = null;
        #oStatusText = null;

        // ---------------------------------------------------------------------------
        // View
        // ---------------------------------------------------------------------------

        _createView() {
            const oConfig = this.getConfig();

            if (!oConfig || !oConfig.id) {
                return new VBox({ items: [new Text({ text: "Configuration error" })] });
            }

            // Model MUST be initialized before controls with bindings
            this.#oLogModel = new JSONModel({ entries: [] });

            this.#oStatusText = new Text({
                text: this.getI18nText("widget.noEventNames")
            }).addStyleClass("sapUiTinyMarginBegin sapUiTinyMarginBottom");

            const oList = new List({
                noDataText: this.getI18nText("widget.noMessages"),
                growing: true,
                growingThreshold: 20,
                items: {
                    path: "/entries",
                    template: new StandardListItem({
                        title: {
                            parts: ["eventName", "value"],
                            formatter: (sName, sVal) => "[" + (sName || "") + "]  " + (sVal || "")
                        },
                        description: "{timestamp}",
                        infoState: "None"
                    })
                }
            }).setModel(this.#oLogModel);

            const oToolbar = new Toolbar({
                content: [
                    new Title({ text: this.getI18nText("widget.title"), titleStyle: "H5" }),
                    new ToolbarSpacer(),
                    new Button({
                        icon: "sap-icon://clear-all",
                        tooltip: this.getI18nText("widget.clear"),
                        press: () => { this.#oLogModel.setProperty("/entries", []); }
                    })
                ]
            });

            // CustomPanel required for POD Designer drag support (sap.m.VBox is not draggable)
            return new CustomPanel(oConfig.id, {
                width: "100%",
                height: "100%",
                content: [
                    new VBox(oConfig.id + "-inner", {
                        width: "100%",
                        items: [oToolbar, this.#oStatusText, oList]
                    })
                ]
            });
        }

        // ---------------------------------------------------------------------------
        // Lifecycle
        // ---------------------------------------------------------------------------

        async onInit() {
            await super.onInit();
            if (PodContext.isRunMode()) {
                this._subscribeToNotifications();
                // Re-subscribe when resource, workcenter or operation changes
                PodContext.subscribe([
                    ModelPath.FilterResources,
                    ModelPath.FilterOperationActivities
                ], this._onContextChanged, this);
            }
        }

        onExit() {
            super.onExit();
            if (PodContext.isRunMode()) {
                PodContext.unsubscribe([
                    ModelPath.FilterResources,
                    ModelPath.FilterOperationActivities
                ], this._onContextChanged, this);
            }
            this._unsubscribeAll();
            this.#oLogModel = null;
            this.#oStatusText = null;
            this.#oLog = null;
        }

        _onContextChanged() {
            this._unsubscribeAll();
            this._subscribeToNotifications();
        }

        // ---------------------------------------------------------------------------
        // Properties
        // ---------------------------------------------------------------------------

        getProperties() {
            // Use hardcoded fallback strings because getI18nText() may return the key
            // if the bundle hasn't loaded yet when the Properties panel first calls getProperties()
            const sDisplayName  = this.getI18nText("property.eventNames")             || "Event Names";
            const sDescription  = this.getI18nText("property.eventNames.description") ||
                "Comma-separated list of POD notification event names to subscribe to.\n" +
                "Each name generates a corresponding 'On Receive' event.\n" +
                "Example: MEASUREMENT,ALERT,STATUS_CHANGE";

            const sInfoHtml =
                "<strong>Info:</strong><ul style='margin:4px 0 0 16px;padding:0'>" +
                "<li><em>'Event Names'</em> field supports a comma (\",\") separated list of event names.</li>" +
                "<li>After adding a new event to the list, reopen the Properties panel to show <em>'On Receive'</em> event configuration.</li>" +
                "</ul>";

            return [
                new WidgetProperty({
                    displayName:    sDisplayName,
                    description:    sDescription,
                    category:       PropertyCategory.General,
                    propertyEditor: new StringPropertyEditor(this, this.PropertyId.EventNames)
                }),
                new WidgetProperty({
                    displayName:    "",
                    category:       PropertyCategory.General,
                    propertyEditor: new StaticInfoEditor(this, sInfoHtml)
                })
            ];
        }

        setPropertyValue(sName, vValue) {
            super.setPropertyValue(sName, vValue);
            if (sName === this.PropertyId.EventNames && PodContext.isRunMode()) {
                this._unsubscribeAll();
                this._subscribeToNotifications();
            }

            // In design mode, force the Properties panel to re-query getEvents().
            // The POD Designer only re-calls getEvents() when the widget is re-selected.
            // We trigger that by clicking the widget's root DOM node, which causes the
            // PreviewPanel to re-select the widget and PropertiesPanel.updateProperties()
            // to re-run — making the On Receive events appear immediately after tab-out.
            if (!PodContext.isRunMode() && sName === this.PropertyId.EventNames) {
                setTimeout(() => {
                    try {
                        // First try the widget's own rendered root
                        const oView = this.getView();
                        const oDom  = oView && typeof oView.getDomRef === "function"
                            ? oView.getDomRef()
                            : null;
                        if (oDom) {
                            oDom.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
                            return;
                        }
                        // Fallback: click the first focusable element in the preview canvas
                        const oCanvas = document.querySelector(".dmePodDesignerPreviewPanel, [class*='PreviewPanel'], [id*='previewPanel']");
                        if (oCanvas) {
                            oCanvas.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
                        }
                    } catch (e) { /* best-effort */ }
                }, 200);
            }
        }

        // ---------------------------------------------------------------------------
        // Events — one per configured event name
        // getEvents() must return a plain Array; super.getEvents() is undefined on Widget
        // ---------------------------------------------------------------------------

        getEvents() {
            return this._getEventNamesList().map(sEventName =>
                new WidgetEvent({
                    id: this._buildEventId(sEventName),
                    displayName: this.getI18nText("event.onReceive.displayName", [sEventName]),
                    description: this.getI18nText("event.onReceive.description", [sEventName])
                })
            );
        }

        // ---------------------------------------------------------------------------
        // WebSocket subscription
        // ---------------------------------------------------------------------------

        _subscribeToNotifications() {
            const aEventNames = this._getEventNamesList();

            if (aEventNames.length === 0) {
                this._setStatus(this.getI18nText("widget.noEventNames"));
                return;
            }

            // Build context values — only add a filter clause when the value is present
            const sPlant       = PodContext.getPlant();
            const aResources   = PodContext.getFilterResources() || [];
            const sResource    = aResources[0]?.resource || null;

            // Operation and work center come from the adaptive pattern
            const oOp = PodContext.getLastSelectedOperationActivity();
            const oWL = PodContext.getLastSelectedWorkListItem();
            const sOperation   = (oOp?.operationActivity) || (oWL?.operationActivity) || null;
            const sWorkCenter  = (oOp?.workCenter)        || (oWL?.workCenter)        || null;

            aEventNames.forEach(sEventName => {
                try {
                    const aFilters = [
                        Filter.equals("subscription.plant", sPlant),
                        Filter.equals("eventName", sEventName)
                    ];
                    if (sResource)   { aFilters.push(Filter.equals("subscription.resource",    sResource)); }
                    if (sWorkCenter) { aFilters.push(Filter.equals("subscription.workCenter",  sWorkCenter)); }
                    if (sOperation)  { aFilters.push(Filter.equals("subscription.operation",   sOperation)); }

                    const oCtx = PodNotificationWebSocket.subscribe({
                        eventType: EventType.CUSTOM,
                        onMessage: (message) => { this._onNotificationReceived(sEventName, message); },
                        filter: Filter.and(aFilters),
                        description: "PodNotificationHandlerWidget_" + sEventName
                    });
                    this.#aSubscriptions.push(oCtx);
                    this.#oLog.info("Subscribed to [" + sEventName + "] plant=" + sPlant
                        + " resource=" + sResource + " workCenter=" + sWorkCenter
                        + " operation=" + sOperation);
                } catch (oError) {
                    this.#oLog.error("Failed to subscribe to: " + sEventName, oError);
                }
            });

            this._setStatus(this.getI18nText("widget.listening", [aEventNames.join(", ")]));
        }

        _unsubscribeAll() {
            this.#aSubscriptions.forEach(oCtx => {
                try {
                    if (oCtx && typeof oCtx.unsubscribe === "function") {
                        oCtx.unsubscribe();
                    }
                } catch (oError) {
                    this.#oLog.warn("Error during unsubscribe", oError);
                }
            });
            this.#aSubscriptions = [];
        }

        // ---------------------------------------------------------------------------
        // Message handler
        // ---------------------------------------------------------------------------

        _onNotificationReceived(sEventName, oMessage) {
            const aParameters = oMessage.data?.parameters || [];
            const sValue      = aParameters[0]?.value || "";

            // Build a human-readable payload string from the full message data
            let sPayload;
            try {
                sPayload = JSON.stringify(oMessage.data || oMessage);
            } catch (e) {
                sPayload = String(oMessage.data || "");
            }

            // Prepend to log (newest first), cap at 200 entries
            const aEntries = this.#oLogModel.getProperty("/entries") || [];
            const now = new Date();
            const sTimestamp = now.toLocaleDateString() + " " + now.toLocaleTimeString();
            aEntries.unshift({
                timestamp: sTimestamp,
                eventName: sEventName,
                value: sPayload || this.getI18nText("widget.noValue")
            });
            if (aEntries.length > 200) { aEntries.length = 200; }
            this.#oLogModel.setProperty("/entries", aEntries);

            // Publish to PodContext so other widgets can consume the last notification
            try {
                const oNotification = {
                    eventName:  sEventName,
                    eventType:  oMessage.eventType,
                    topic:      oMessage.topic,
                    parameters: aParameters,
                    firstValue: sValue,
                    payload:    sPayload,
                    data:       oMessage.data || {},
                    timestamp:  sTimestamp
                };
                PodContext.set("/PODNotifications", oNotification);
                this.#oLog.info("Published /PODNotifications — event: " + sEventName + " timestamp: " + sTimestamp);
            } catch (oError) {
                this.#oLog.warn("Could not publish to PodContext /PODNotifications", oError);
            }

            // _handleEvent requires a real sap/ui/base/Event — null causes "Event object is required"
            const oEventData = {
                eventName: sEventName,
                eventType: oMessage.eventType,
                topic:     oMessage.topic,
                parameters: aParameters,
                firstValue: sValue,
                payload:   sPayload,
                rawMessage: oMessage
            };
            const oSapEvent = new UIEvent(this._buildEventId(sEventName), this, oEventData);

            try {
                this._handleEvent(this._buildEventId(sEventName), oSapEvent, oEventData);
            } catch (oError) {
                this.#oLog.error("Error firing event for [" + sEventName + "]", oError);
            }
        }

        // ---------------------------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------------------------

        _getEventNamesList() {
            const sRaw = this.getPropertyValue(this.PropertyId.EventNames) || "";
            return sRaw.split(",").map(s => s.trim()).filter(s => s.length > 0);
        }

        _buildEventId(sEventName) {
            return "onReceive_" + sEventName.replace(/[^a-zA-Z0-9_]/g, "_");
        }

        _setStatus(sText) {
            if (this.#oStatusText) {
                this.#oStatusText.setText(sText);
            }
        }
    }

    return PodNotificationHandlerWidget;
});
