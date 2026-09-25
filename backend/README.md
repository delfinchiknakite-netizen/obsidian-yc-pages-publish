# yc-pages — публикация markdown-страниц с TTL на Яндекс Облаке

Serverless-сервис: форма → Cloud Function рендерит markdown в HTML → кладёт в Object Storage.
Главная показывает список активных страниц, каждая живёт заданное время (7/30/90 дней) и
исчезает автоматически. **Крон не нужен.**

## Как это работает

```
web/new.html / Obsidian-плагин ──POST──► API Gateway ──► CF pages-create
    action=page       → одна страница  p/<ttl>/<slug>/index.html
    action=site-init  → сайт из папки  s/<ttl>/<siteSlug>/index.html + data.json
    action=site-page  → страница сайта s/<ttl>/<siteSlug>/<slug>/index.html
                                          │  markdown-it: MD → HTML
                                          │  картинки → presigned PUT (assets/)
                                          └─ update manifest.json (сам чистит истёкшие)

web/index.html (статика + JS): читает manifest.json и прячет записи с expiresAt < now
Сайт: s/.../index.html строит поиск+фильтры+сортировку из data.json на клиенте
Object Storage lifecycle: удаляет файлы по префиксам p/ и s/ 7|30|90 (раз в сутки)
```

Действия функции (единый эндпоинт, диспетч по полю `action`):
- **page** — одиночная заметка (форма или ПКМ по файлу).
- **site-init** + **site-page** — многостраничный сайт из ЛЮБОЙ папки (ПКМ по папке); фильтры/сортировки
  авто-строятся из frontmatter, ничего не зашито под конкретную папку.
- Картинки во всех случаях: плагин переписывает ссылки на `assets/<имя>`, функция выдаёт presigned-URL,
  плагин заливает бинарники (ключи S3 остаются на сервере).

- **Видимость** ссылки истекает точно в `expiresAt` (JS в браузере, любой per-page TTL).
- **Файлы** дочищает lifecycle по префиксу (гранулярность — дни).
- **manifest.json** самоочищается при каждом создании новой страницы.

## Структура

```
yc-pages/
  terraform/            # вся инфраструктура
    versions.tf providers.tf variables.tf main.tf outputs.tf
    terraform.tfvars.example
    .terraformrc        # YC-зеркало провайдеров (HashiCorp заблокирован из РФ)
  function/             # исходник Cloud Function (Node.js 18)
    index.js package.json
  web/                  # статика
    index.html          # главная (JS-фильтр по TTL)
    error.html          # 404
    new.html.tftpl      # форма (в неё TF подставляет URL API Gateway)
  api-gateway.yaml.tftpl # OpenAPI-спека шлюза (TF подставляет id функции и SA)
```

## Развёртывание

Требования: `terraform >= 1.5`, `yc` CLI (настроенный `yc init`).

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# отредактируй terraform.tfvars: bucket_name (уникальный), create_token (openssl rand -hex 16)

# провайдеры через YC-зеркало + auth
export TF_CLI_CONFIG_FILE="$PWD/.terraformrc"
export YC_TOKEN=$(yc iam create-token)

terraform init
terraform apply
```

После apply в outputs будут:
- `site_url` — главная (открывается с телефона)
- `new_page_form` — форма создания
- `api_url` — POST-эндпоинт

## Проверка

```bash
TOKEN=$(grep create_token terraform/terraform.tfvars | cut -d'"' -f2)
API=$(cd terraform && terraform output -raw api_url)
curl -s -X POST "$API" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Тест\",\"markdown\":\"# Привет\\n\\n**жирный**\",\"ttlDays\":7,\"token\":\"$TOKEN\"}"
```

## Заметки

- `create_token` и статический S3-ключ хранятся в env функции и в стейте Terraform —
  держи `terraform.tfstate` в приватном месте. Для продакшена вынеси секреты в **Lockbox**.
- Бакет публичный на чтение → форму `new.html` видят все; защищает только токен.
- SA получает роль `storage.admin` (нужно для create-bucket через S3 API) + `functions.functionInvoker`.
- TTL-варианты (7/30/90) зашиты в путь `p/<ttl>/` и в lifecycle-правила. Добавить новый TTL =
  добавить `lifecycle_rule` в main.tf, `<option>` в new.html.tftpl и значение в `ALLOWED_TTL` в function/index.js.

## Адаптация уже развёрнутого стенда

Если сервис уже создан руками (`yc` CLI) и хочешь перевести под Terraform без пересоздания —
`terraform import` каждого ресурса (bucket, SA, function, api-gateway). Иначе `apply` создаст
новый бакет с другим именем.
