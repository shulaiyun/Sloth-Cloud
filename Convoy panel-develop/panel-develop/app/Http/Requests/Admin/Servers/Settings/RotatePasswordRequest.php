<?php

namespace Convoy\Http\Requests\Admin\Servers\Settings;

use Convoy\Http\Requests\BaseApiRequest;
use Convoy\Rules\Password;
use Convoy\Rules\USKeyboardCharacters;

class RotatePasswordRequest extends BaseApiRequest
{
    public function rules(): array
    {
        return [
            'password' => ['nullable', 'string', 'min:8', 'max:191', new Password(), new USKeyboardCharacters()],
            'restart_after_reset' => ['sometimes', 'boolean'],
        ];
    }
}
