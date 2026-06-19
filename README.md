# POD Notification Handler Widget 📨

A custom SAP Digital Manufacturing **POD 2.0** plugin that can handle all your POD Notification needs.
It subscribes to real-time POD WebSocket notifications, displays a live message log, fires configurable **On Receive** action events, and publishes notification data into the shared POD Context for consumption by other widgets.

<img width="1389" height="553" alt="image" src="https://github.com/user-attachments/assets/cebbb829-d6d0-4f06-b08b-9a2ec2fa0df7" />

---

## Table of Contents

- [Overview](#overview)
- [File Structure](#file-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
  - [Subscription Filter](#subscription-filter)
  - [Context Re-subscription](#context-re-subscription)
  - [Message Log](#message-log)
  - [On Receive Events](#on-receive-events)
  - [PodContext Integration](#podcontext-integration)
- [Sending a Notification](#sending-a-notification)
- [Consuming PODNotifications in Other Widgets](#consuming-podnotifications-in-other-widgets)
- [Event Data Reference](#event-data-reference)
- [Languages Supported](#languages-supported)
- [Technical Reference](#technical-reference)

---

## Overview

POD Notifications allow external systems (machines, IoT devices, MES integrations) to push real-time messages into the SAP Digital Manufacturing POD via the `/notification/v1/send` REST endpoint. This widget subscribes to one or more named notification events and:

1. **Displays** every received message in a scrollable timestamped log inside the widget.
2. **Fires** a dedicated **On Receive** POD Designer action event for each configured event name, enabling standard POD actions (navigate, execute, show message, etc.) to react to incoming notifications.
3. **Publishes** the last received notification to `PodContext` at path `/PODNotifications`, making the payload available to any other widget or binding in the POD.

---

## File Structure

```
20PODNotificationDisplay/
├── extension.json                          # Widget registration
├── README.md                               # This file
├── PodNotificationHandler_deployment.zip   # Ready-to-upload deployment package
├── widget/
│   └── PodNotificationHandlerWidget.js     # Widget implementation
└── i18n/
    ├── i18n.properties                     # Default (English fallback)
    ├── i18n_en.properties                  # English
    ├── i18n_de.properties                  # German
    ├── i18n_zh.properties                  # Chinese Simplified
    └── i18n_ja.properties                  # Japanese
```

---

## 🚀 Installation

1. Download `PodNotificationHandler_deployment.zip` 
2. Navigate to **Manage PODs 2.0** app
3. Go to **Extensions** tab
4. Click **Create**
5. Fill in:
   - **Name**: podNotificationHandler (or your preferred name)
   - **Namespace**: `custom/pod2/podNotificationHandler`
   - **Source Code**: Browse and Select the ZIP file
6. Click **Upload**
<img width="1882" height="708" alt="image" src="https://github.com/user-attachments/assets/56283eb4-c758-46d9-9707-c727a4011763" />

8. The widget appears immediately in Manage PODs 2.0 under **Custom Widgets** on a POD edit mode
4. Drag **POD Notification Handler** onto your POD canvas and configure the properties below
<img width="476" height="351" alt="image" src="https://github.com/user-attachments/assets/ad5859ca-1035-42fe-ae62-a0614dff3ac5" />

> ⚠️ The ZIP must contain `extension.json` at its root. The release ZIP is pre-packaged correctly — don't re-zip.

---

## Configuration

### Plugin Properties

| Property | Description |
|---|---|
| **Event Names** | Comma-separated list of POD notification event names to subscribe to. Example: `MEASUREMENT,ALERT,STATUS_CHANGE` |

**Notes:**
- Each event name in the list generates a corresponding **On Receive** event in the **Events** panel.
- After adding or changing event names, **reopen the Properties panel** to see the updated On Receive event list.
- Event names are case-sensitive and must match exactly what the sender publishes in the `eventName` field.

### Wiring On Receive Events

1. After configuring **Event Names**, close and reopen the Properties panel.
2. Switch to the **Events** tab in the Properties panel.
3. For each event name you configured, an **On Receive: `<EventName>`** event appears.
4. Click the event to add actions — these execute every time a matching notification arrives.

**Example**: For event name `TEMPERATURE`, the event `On Receive: TEMPERATURE` appears. You can wire it to show a message box, navigate to a step, or execute any other standard POD action.

<img width="1554" height="741" alt="image" src="https://github.com/user-attachments/assets/2f965116-d526-411d-81bb-b156c4a977f3" />
<img width="1555" height="649" alt="image" src="https://github.com/user-attachments/assets/17fc6813-a9b0-46a3-91ac-c0ca5e873987" />

---

## How It Works

### Subscription Filter

When the widget initialises (or when the POD context changes), it calls `PodNotificationWebSocket.subscribe()` once per configured event name. The server-side filter includes:

| Filter field | Value | Always included? |
|---|---|---|
| `subscription.plant` | Current plant from `PodContext.getPlant()` | Yes |
| `eventName` | The configured event name | Yes |
| `subscription.resource` | First selected resource | Only if a resource is selected |
| `subscription.workCenter` | Selected work center | Only if a work center is selected |
| `subscription.operation` | Selected operation activity | Only if an operation is selected |

This means the widget only receives messages that match the current operator's context — it will not receive notifications intended for a different resource or work center.

**Logged subscription example:**
```
Subscribed to [MEASUREMENT] plant=1710 resource=LINE_01 workCenter=WC_ASM operation=OP10
```

### Context Re-subscription

The widget subscribes to `ModelPath.FilterResources` and `ModelPath.FilterOperationActivities` in PodContext. Whenever the operator selects a different resource, work center, or operation, all existing WebSocket subscriptions are torn down and recreated with the new context values. This ensures the filter always reflects the current POD state.

### Message Log

The widget renders a scrollable list showing the last **200** received messages, newest first. Each row displays:

- **Title**: `[EventName]  <full JSON payload>`
- **Description**: `<date> <time>`

A **Clear** button (trash icon) in the toolbar empties the log. The list uses `growing: true` with a threshold of 20, loading more rows on demand.

<img width="1417" height="554" alt="image" src="https://github.com/user-attachments/assets/f40828ef-aabe-499d-a49d-dd62c654eeae" />

### On Receive Events

Each incoming notification fires `_handleEvent(eventId, oSapEvent, oEventData)` where `eventId` is derived from the event name (e.g. `onReceive_MEASUREMENT`). A real `sap/ui/base/Event` object is constructed to satisfy the framework requirement. The event data object passed to downstream POD actions contains:

```json
{
  "eventName":   "MEASUREMENT",
  "eventType":   "sap.dsc.dm.GENERIC.MESSAGE.v1",
  "topic":       "production",
  "parameters":  [ { "name": "message", "value": "..." } ],
  "firstValue":  "value of first parameter",
  "payload":     "{\"eventName\":\"MEASUREMENT\", ...}",
  "rawMessage":  { ... }
}
```

### PodContext Integration

After every received notification, the widget publishes to `PodContext` at path `/PODNotifications`:

```javascript
PodContext.set("/PODNotifications", {
    eventName:  "MEASUREMENT",
    eventType:  "sap.dsc.dm.GENERIC.MESSAGE.v1",
    topic:      "production",
    parameters: [ { name: "message", value: "98.6" } ],
    firstValue: "98.6",
    payload:    "{\"eventName\":\"MEASUREMENT\", \"parameters\":[...]}",
    data:       { /* full message.data object */ },
    timestamp:  "6/19/2026 10:19:10 AM"
});
```

Only the **most recent** notification is stored — each new message overwrites the previous one.

---

## Sending a Notification

Use the SAP DM REST API endpoint `POST /notification/v1/send` with a payload like:

```json
{
    "eventName": "MEASUREMENT",
    "subscription": {
        "plant": "1710",
        "resource": "LINE_01",
        "workCenter": "WC_ASM"
    },
    "parameters": [
        {
            "name": "message",
            "value": "Temperature: 98.6°C"
        }
    ]
}
```

**Key rules:**
- `eventName` must match exactly what is configured in the **Event Names** property.
- `subscription.plant` must match the plant the POD is running in.
- `subscription.resource`, `subscription.workCenter`, and `subscription.operation` are optional but must match the widget's active filter if provided — otherwise the server will not route the message to the subscription.

---

<img width="1892" height="856" alt="image" src="https://github.com/user-attachments/assets/b0d5038e-f88c-4017-9102-77f098775322" />
<img width="1176" height="519" alt="image" src="https://github.com/user-attachments/assets/e8afcbb2-0587-48b8-a846-5555ab17ea4e" />

## Consuming PODNotifications in Other Widgets

### Subscribe in another widget

```javascript
PodContext.subscribe("/PODNotifications", (oNotification) => {
    console.log("Event:", oNotification.eventName);
    console.log("Payload:", oNotification.payload);
    console.log("First value:", oNotification.firstValue);
}, this);
```
Remember to unsubscribe in `onExit()`:

```javascript
onExit() {
    super.onExit();
    PodContext.unsubscribe("/PODNotifications", this._onNotification, this);
}
```

### Use in a binding expression

```javascript
// In a Text control inside another widget
new Text({
    text: {
        path: "pod>/PODNotifications/firstValue"
    }
})
```

<img width="324" height="530" alt="image" src="https://github.com/user-attachments/assets/2e626104-cd1b-440c-88bc-2554041804a1" />
<img width="1460" height="673" alt="image" src="https://github.com/user-attachments/assets/a47bd450-5bf4-41d2-8f40-67d03062244e" />

## Event Data Reference

| Field | Type | Description |
|---|---|---|
| `eventName` | `string` | The matched event name (e.g. `MEASUREMENT`) |
| `eventType` | `string` | SAP event type (e.g. `sap.dsc.dm.GENERIC.MESSAGE.v1`) |
| `topic` | `string` | Notification topic (e.g. `production`) |
| `parameters` | `Array<{name, value}>` | Full parameters array from the notification payload |
| `firstValue` | `string` | Shortcut to `parameters[0].value` |
| `payload` | `string` | Full `message.data` serialised as JSON string |
| `data` | `object` | Raw `message.data` object |
| `timestamp` | `string` | Local date+time string when the message was received |

---

## Languages Supported

| Code | Language |
|---|---|
| `en` | English |
| `de` | German |
| `zh` | Chinese Simplified |
| `ja` | Japanese |

---

## Technical Reference

### Key Dependencies

| Module | Purpose |
|---|---|
| `sap/dm/dme/pod2/notification/PodNotificationWebSocket` | Manages the persistent WebSocket connection and subscription lifecycle |
| `sap/dm/dme/pod2/notification/EventType` | Provides the `CUSTOM` event type constant |
| `sap/dm/dme/pod2/notification/Filter` | Builds server-side filter expressions (`Filter.and`, `Filter.equals`) |
| `sap/dm/dme/pod2/context/PodContext` | Reads plant/resource/operation context and publishes to `/PODNotifications` |
| `sap/dm/dme/pod2/control/CustomPanel` | Root container — required for POD Designer drag-and-drop support |
| `sap/ui/base/Event` | Used to construct a valid event object for `_handleEvent()` |

### PodContext Path Written

```
/PODNotifications   →   most recent notification object (see Event Data Reference)
```

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Author

Manoel Costa http://manoelcosta.com/

Disclaimer: This is a community extension and is not officially supported by SAP. Use at your own discretion.
