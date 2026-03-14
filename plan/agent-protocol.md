# Agent Protocol

Agent communicates with manager using HTTPS API.

Recommended: mTLS authentication.

------------------------------------------------------------------------

## Agent Registration

POST /nodes/register

Payload

``` json
{
  "hostname": "vpn-node-1",
  "ip": "1.2.3.4",
  "version": "1.0.0"
}
```

------------------------------------------------------------------------

## Task Polling

Agent polls manager for tasks.

GET /nodes/{node_id}/tasks

Response

``` json
{
  "tasks": [
    {
      "id": "uuid",
      "action": "create_vpn_user",
      "payload": {
        "username": "developer"
      }
    }
  ]
}
```

------------------------------------------------------------------------

## Task Result

POST /tasks/{task_id}/result

``` json
{
  "status": "success"
}
```

------------------------------------------------------------------------

## Heartbeat

Agent sends heartbeat every 30 seconds.

POST /nodes/heartbeat

``` json
{
  "node_id": "uuid"
}
```
