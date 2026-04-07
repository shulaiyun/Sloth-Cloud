<?php

namespace Convoy\Http\Requests\Admin\Servers;

use Convoy\Enums\Server\PowerAction;
use Convoy\Http\Requests\BaseApiRequest;
use Illuminate\Validation\Rules\Enum;

class SendPowerCommandRequest extends BaseApiRequest
{
    public function rules(): array
    {
        return [
            'state' => ['required', new Enum(PowerAction::class)],
        ];
    }
}

