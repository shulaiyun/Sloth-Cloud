<?php

namespace Convoy\Data\Server\Proxmox;

use Spatie\LaravelData\Data;
use Convoy\Enums\Server\State;

class ServerStateData extends Data
{
    public function __construct(
        public State $state,
        public float $cpu_used,
        public int   $memory_total,
        public int   $memory_used,
        public int   $uptime,
        public int   $disk_total,
        public int   $disk_used,
        public int   $rx_bytes,
        public int   $tx_bytes,
    )
    {
    }

    public static function fromRaw(array $raw)
    {
        return new self(...[
            'state' => State::from($raw['status']),
            'uptime' => $raw['uptime'],
            'cpu_used' => $raw['cpu'],
            'memory_total' => $raw['maxmem'],
            'memory_used' => $raw['mem'],
            'disk_total' => intval($raw['maxdisk'] ?? 0),
            'disk_used' => intval($raw['disk'] ?? 0),
            'rx_bytes' => intval($raw['netin'] ?? 0),
            'tx_bytes' => intval($raw['netout'] ?? 0),
        ]);
    }
}
