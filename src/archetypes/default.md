+++
title = '{{ replace .File.ContentBaseName "-" " " | title }}'
date = {{ .Date }}
draft = true
+++

{{ template "_internal/google_analytics.html" . }}
{{ template "_internal/opengraph.html" . }}
