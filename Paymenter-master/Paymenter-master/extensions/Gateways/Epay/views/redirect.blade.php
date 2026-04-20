<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Redirecting to payment</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #0b1520;
            color: #e6edf3;
            display: flex;
            min-height: 100vh;
            align-items: center;
            justify-content: center;
        }

        .panel {
            max-width: 420px;
            padding: 24px;
            border-radius: 16px;
            background: rgba(17, 34, 51, 0.92);
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.24);
        }

        .panel h1 {
            margin: 0 0 12px;
            font-size: 20px;
        }

        .panel p {
            margin: 0 0 16px;
            line-height: 1.5;
            color: #b8c7d9;
        }

        .panel button {
            appearance: none;
            border: none;
            border-radius: 999px;
            background: linear-gradient(135deg, #4fd1c5, #63b3ed);
            color: #05131f;
            font-weight: 700;
            padding: 12px 20px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="panel">
        <h1>Redirecting to payment</h1>
        <p>If your browser does not continue automatically, use the button below.</p>
        <form id="epay-redirect-form" action="{{ $actionUrl }}" method="post">
            @foreach ($params as $key => $value)
                <input type="hidden" name="{{ $key }}" value="{{ $value }}">
            @endforeach
            <button type="submit">Continue to gateway</button>
        </form>
    </div>
    <script>
        window.setTimeout(function () {
            var form = document.getElementById('epay-redirect-form');
            if (form) {
                form.submit();
            }
        }, 120);
    </script>
</body>
</html>
