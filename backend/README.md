# Backend — просто публичный S3-бакет (сервер не нужен)

Плагин **YC Pages Publish** пишет напрямую в S3-совместимый бакет (подпись AWS SigV4 в самом
плагине). Никакой Cloud Function / API Gateway не требуется — нужен только **бакет со static
hosting и публичным чтением** и **ключ доступа**.

Подойдёт любой S3-провайдер (Yandex Object Storage, AWS S3, Cloudflare R2, Backblaze B2, MinIO).
Здесь — Terraform для Яндекс Облака, который создаёт ровно это.

## Terraform (Яндекс Облако)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # bucket_name (уникальное), cloud_id, folder_id
export TF_CLI_CONFIG_FILE="$PWD/.terraformrc"   # зеркало провайдеров (полезно из РФ)
export YC_TOKEN=$(yc iam create-token)
terraform init
terraform apply
```

Выведет всё для настроек плагина:

```bash
terraform output s3_endpoint          # https://storage.yandexcloud.net
terraform output s3_bucket
terraform output s3_public_base_url    # https://<bucket>.website.yandexcloud.net
terraform output s3_access_key_id
terraform output -raw s3_secret_access_key
```

Создаётся: сервисный аккаунт + статический ключ, публичный бакет со static hosting
(`index.html`/`error.html`) и lifecycle-правилами (удаление по TTL-префиксам `p/`,`s/` 7/30/90 —
как подстраховка к очистке из плагина).

## Вручную (любой провайдер)

1. Создать бакет, включить **static website hosting** (index=`index.html`, error=`error.html`).
2. Открыть **публичное чтение** объектов.
3. Получить **access key / secret** с правами на бакет.
4. Вписать endpoint, регион, бакет, ключи и публичный URL в настройки плагина.
