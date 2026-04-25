import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.content}>
        <div className={styles.icon}>404</div>
        <h1 className={styles.title}>Page Not Found</h1>
        <p className={styles.desc}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button className={styles.homeBtn} onClick={() => navigate('/')}>
          Go Home
        </button>
      </div>
    </div>
  );
}
