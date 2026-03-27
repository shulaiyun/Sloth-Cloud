<?php

namespace App\Http\Requests\Api\V1\Auth;

use App\Models\CustomProperty;
use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'device_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'properties' => ['sometimes', 'array'],
        ];

        if (config('settings.tos')) {
            $rules['tos'] = ['accepted'];
        }

        foreach (CustomProperty::where('model', \App\Models\User::class)->get() as $property) {
            $prefix = $property->required ? 'required|' : 'nullable|';
            $rules["properties.{$property->key}"] = $prefix . $property->validation;
        }

        return $rules;
    }
}

