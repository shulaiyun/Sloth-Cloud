<?php

namespace Convoy\Http\Requests\Admin\Servers\Settings;

use Convoy\Http\Requests\BaseApiRequest;
use Convoy\Models\Server;
use Convoy\Models\Template;
use Convoy\Rules\Password;
use Convoy\Rules\USKeyboardCharacters;

class ReinstallServerRequest extends BaseApiRequest
{
    public function rules(): array
    {
        return [
            'template_uuid' => 'required|string|exists:templates,uuid',
            'account_password' => ['required', 'string', 'min:8', 'max:191', new Password(), new USKeyboardCharacters()],
            'start_on_completion' => 'present|boolean',
        ];
    }

    public function withValidator($validator)
    {
        $validator->after(function ($validator) {
            $template = Template::where('uuid', '=', $this->template_uuid)->firstOrFail();
            $server = $this->parameter('server', Server::class);

            if ($server->node_id !== $template->group->node_id) {
                $validator->errors()->add('template_uuid', 'The selected template is invalid.');
            }
        });
    }
}

