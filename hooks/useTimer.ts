
import { useState, useEffect, useRef } from 'react';

export function useTimer() {
  const [timerTimeLeft, setTimerTimeLeft] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isResting && timerTimeLeft > 0) {
      timerIntervalRef.current = window.setInterval(() => {
        setTimerTimeLeft((prev) => {
          if (prev <= 1) {
            setIsResting(false);
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isResting, timerTimeLeft]);

  const startTimer = (seconds: number) => {
    setTimerTimeLeft(seconds);
    setIsResting(true);
  };

  const stopTimer = () => {
    setTimerTimeLeft(0);
    setIsResting(false);
  };

  const addTime = (seconds: number) => {
    setTimerTimeLeft((prev) => prev + seconds);
  };

  return {
    timerTimeLeft,
    isResting,
    startTimer,
    stopTimer,
    addTime
  };
}
