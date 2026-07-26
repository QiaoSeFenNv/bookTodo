pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timestamps()
    timeout(time: 20, unit: 'MINUTES')
    skipDefaultCheckout(true)
  }

  triggers {
    githubPush()
  }

  environment {
    APP_CONTAINER = 'book-todo'
    DB_CONTAINER = 'renti-postgres'
    DB_NAME = 'book_todo'
    COMPOSE_FILE = 'docker-compose.prod.yml'
    BOOK_TODO_PORT = '28889'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.IMAGE_TAG = sh(
            script: 'git rev-parse --short=12 HEAD',
            returnStdout: true
          ).trim()
          env.BOOK_TODO_IMAGE = "book-todo:${env.IMAGE_TAG}"
        }
      }
    }

    stage('Verify Docker') {
      steps {
        sh '''
          set -eu
          docker version >/dev/null
          docker compose version >/dev/null
          docker inspect "$DB_CONTAINER" >/dev/null
          if [ "$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER")" != 'healthy' ]; then
            echo "$DB_CONTAINER is not healthy" >&2
            exit 1
          fi
        '''
      }
    }

    stage('Ensure Database') {
      steps {
        sh '''
          set -eu
          if ! docker exec "$DB_CONTAINER" psql -U postgres -tAc \
            "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
            | grep -qx '1'; then
            docker exec "$DB_CONTAINER" createdb -U postgres "$DB_NAME"
          fi
        '''
      }
    }

    stage('Build Image') {
      steps {
        sh '''
          set -eu
          docker build --pull \
            --label com.booktodo.image=true \
            --tag "$BOOK_TODO_IMAGE" .
        '''
      }
    }

    stage('Migrate Database') {
      steps {
        withCredentials([
          string(credentialsId: 'book-todo-database-url', variable: 'DATABASE_URL'),
          string(credentialsId: 'book-todo-access-key', variable: 'APP_ACCESS_KEY')
        ]) {
          sh '''
            set -eu
            docker run --rm \
              --network host \
              -e DATABASE_URL \
              -e APP_ACCESS_KEY \
              -e NODE_ENV=production \
              "$BOOK_TODO_IMAGE" \
              node apps/server/dist/db-init.js
          '''
        }
      }
    }

    stage('Deploy') {
      steps {
        withCredentials([
          string(credentialsId: 'book-todo-database-url', variable: 'DATABASE_URL'),
          string(credentialsId: 'book-todo-access-key', variable: 'APP_ACCESS_KEY')
        ]) {
          sh '''
            set -eu
            export DATABASE_URL APP_ACCESS_KEY BOOK_TODO_IMAGE BOOK_TODO_PORT
            docker compose -f "$COMPOSE_FILE" up -d \
              --no-build \
              --force-recreate
          '''
        }
      }
    }

    stage('Health Check') {
      steps {
        sh '''
          set -eu
          attempt=1
          while [ "$attempt" -le 30 ]; do
            status="$(docker inspect --format '{{.State.Health.Status}}' "$APP_CONTAINER" 2>/dev/null || true)"
            if [ "$status" = 'healthy' ]; then
              docker exec "$APP_CONTAINER" node -e \
                "fetch('http://127.0.0.1:28889/api/health').then(async r=>{const b=await r.json();if(!r.ok||!b.ok||!b.db)process.exit(1);console.log(JSON.stringify(b))})"
              exit 0
            fi
            if [ "$status" = 'unhealthy' ]; then
              docker logs --tail 100 "$APP_CONTAINER"
              exit 1
            fi
            attempt=$((attempt + 1))
            sleep 2
          done

          echo 'Application health check timed out' >&2
          docker logs --tail 100 "$APP_CONTAINER"
          exit 1
        '''
      }
    }
  }

  post {
    failure {
      sh 'docker logs --tail 100 "$APP_CONTAINER" 2>/dev/null || true'
    }
    success {
      echo "Deployed ${env.BOOK_TODO_IMAGE}"
    }
  }
}
